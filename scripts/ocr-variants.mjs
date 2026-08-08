import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';
const modules=process.env.OCR_DIAGNOSTIC_MODULES||'/tmp/billsplit-ocr-diagnostic/node_modules';
const {default:sharp}=await import(pathToFileURL(path.join(modules,'sharp/lib/index.js')));const {createWorker}=await import(pathToFileURL(path.join(modules,'tesseract.js/src/index.js')));
if(!process.argv[2])throw Error('Usage: node scripts/ocr-variants.mjs <local-receipt-image> [output-directory]');
const input=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]||'diagnostics/ocr-variants');await fs.mkdir(out,{recursive:true});
const meta=await sharp(input).metadata();
// Bright-paper bounds are intentionally determined from the pixels rather than this receipt's coordinates.
const {data,info}=await sharp(input).rotate().grayscale().raw().toBuffer({resolveWithObject:true}),counts=new Uint32Array(info.width);
for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[y*info.width+x]>105)counts[x]++;
const candidates=[...counts].map((n,x)=>({x,n})).filter(v=>v.n>info.height*.42);let left=candidates[0]?.x||0,right=candidates.at(-1)?.x||info.width-1;left=Math.max(0,left-15);right=Math.min(info.width-1,right+15);
const extract={left,top:0,width:right-left+1,height:info.height},targetWidth=1800;
const {data:appPixels,info:appInfo}=await sharp(input).rotate().extract(extract).resize({width:targetWidth,kernel:'lanczos3'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});let appMin=255,appMax=0;
for(let i=0;i<appPixels.length;i+=4){const g=.2126*appPixels[i]+.7152*appPixels[i+1]+.0722*appPixels[i+2];appMin=Math.min(appMin,g);appMax=Math.max(appMax,g);appPixels[i]=appPixels[i+1]=appPixels[i+2]=g}const appRange=Math.max(40,appMax-appMin);
for(let i=0;i<appPixels.length;i+=4){let g=(appPixels[i]-appMin)*255/appRange;g=Math.max(0,Math.min(255,(g-128)*1.25+128));appPixels[i]=appPixels[i+1]=appPixels[i+2]=Math.round(g)}
const {data:sharpPixels,info:sharpInfo}=await sharp(input).rotate().extract(extract).resize({width:targetWidth,kernel:'lanczos3'}).ensureAlpha().raw().toBuffer({resolveWithObject:true}),hist=new Uint32Array(256);for(let i=0;i<sharpPixels.length;i+=4)hist[Math.round(.2126*sharpPixels[i]+.7152*sharpPixels[i+1]+.0722*sharpPixels[i+2])]++;
const total=sharpInfo.width*sharpInfo.height;let acc=0,low=0,high=255;for(let n=0;n<256;n++){acc+=hist[n];if(acc>=total*.01){low=n;break}}acc=0;for(let n=255;n>=0;n--){acc+=hist[n];if(acc>=total*.01){high=n;break}}const gray=new Uint8Array(total);for(let p=0,i=0;p<total;p++,i+=4){let g=(.2126*sharpPixels[i]+.7152*sharpPixels[i+1]+.0722*sharpPixels[i+2]-low)*255/Math.max(20,high-low);gray[p]=Math.max(0,Math.min(255,1.2*g-25))}for(let y=0;y<sharpInfo.height;y++)for(let x=0;x<sharpInfo.width;x++){const p=y*sharpInfo.width+x,i=p*4,c=gray[p],l=gray[p-(x>0?1:0)],r=gray[p+(x<sharpInfo.width-1?1:0)],u=gray[p-(y>0?sharpInfo.width:0)],d=gray[p+(y<sharpInfo.height-1?sharpInfo.width:0)],g=Math.max(0,Math.min(255,5*c-l-r-u-d));sharpPixels[i]=sharpPixels[i+1]=sharpPixels[i+2]=g}
const variants={
  original:sharp(input).rotate(),
  app_detail:sharp(appPixels,{raw:appInfo}),
  app_sharp:sharp(sharpPixels,{raw:sharpInfo}),
  app_sharp_lower:sharp(sharpPixels,{raw:sharpInfo}).extract({left:0,top:Math.floor(sharpInfo.height*.38),width:sharpInfo.width,height:sharpInfo.height-Math.floor(sharpInfo.height*.38)}),
  cropped_gray:sharp(input).rotate().extract(extract).resize({width:targetWidth}).grayscale().normalize().linear(1.2,-25).sharpen()
};
const worker=await createWorker('eng');const report={original:{width:meta.width,height:meta.height},paperBounds:extract,variants:[]};
for(const [name,pipeline] of Object.entries(variants)){const image=path.join(out,`${name}.png`);await pipeline.png().toFile(image);const dimensions=await sharp(image).metadata();for(const psm of [3,4,6]){await worker.setParameters({tessedit_pageseg_mode:String(psm),preserve_interword_spaces:'1',user_defined_dpi:'300'});const {data:r}=await worker.recognize(image,{}, {text:true,tsv:true,blocks:true,hocr:false,pdf:false,imageColor:false,imageGrey:false,imageBinary:false});await fs.writeFile(path.join(out,`${name}-psm-${psm}.txt`),r.text||'');await fs.writeFile(path.join(out,`${name}-psm-${psm}.tsv`),r.tsv||'');report.variants.push({name,psm,width:dimensions.width,height:dimensions.height,confidence:r.confidence,text:r.text})}}
await worker.terminate();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
for(const r of report.variants){const wanted=['Halfmoon','Cheesebu','Horrog','Lemonade','Saucy','200g','300g','Southern'];console.log(r.name,'PSM',r.psm,'confidence',r.confidence,'found',wanted.filter(x=>r.text.includes(x)).join(','))}console.log('paper bounds',extract);
