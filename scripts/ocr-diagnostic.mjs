import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

if(!process.argv[2])throw Error('Usage: node scripts/ocr-diagnostic.mjs <local-receipt-image> [output-directory]');
const imagePath=path.resolve(process.argv[2]);
const outputDir=path.resolve(process.argv[3]||'diagnostics/ocr-run');
const modules=process.env.OCR_DIAGNOSTIC_MODULES||'/tmp/billsplit-ocr-diagnostic/node_modules';
const {default:sharp}=await import(pathToFileURL(path.join(modules,'sharp/lib/index.js')));
const {createWorker}=await import(pathToFileURL(path.join(modules,'tesseract.js/src/index.js')));
await fs.mkdir(outputDir,{recursive:true});

const source=sharp(imagePath).rotate(),meta=await source.metadata();
const long=Math.max(meta.width,meta.height),scale=Math.min(3,Math.max(1,1800/long));
const width=Math.round(meta.width*scale),height=Math.round(meta.height*scale);
const {data,info}=await source.resize(width,height,{kernel:'lanczos3'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
let min=255,max=0;
for(let i=0;i<data.length;i+=4){const g=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];min=Math.min(min,g);max=Math.max(max,g);data[i]=data[i+1]=data[i+2]=g}
const range=Math.max(40,max-min);
for(let i=0;i<data.length;i+=4){let g=(data[i]-min)*255/range;g=Math.max(0,Math.min(255,(g-128)*1.25+128));data[i]=data[i+1]=data[i+2]=Math.round(g)}
const processedPath=path.join(outputDir,'processed.png');
await sharp(data,{raw:info}).png().toFile(processedPath);
const diagnostic={input:imagePath,original:{width:meta.width,height:meta.height,orientation:meta.orientation,format:meta.format},processed:{width,height,scale,min,max},runs:[]};
const worker=await createWorker('eng',1,{logger:m=>{if(m.status==='recognizing text'&&Math.round(m.progress*100)%25===0)process.stdout.write(`PSM progress ${Math.round(m.progress*100)}%\n`)}});
for(const psm of [3,4,6,11,12]){
  await worker.setParameters({tessedit_pageseg_mode:String(psm),preserve_interword_spaces:'1',user_defined_dpi:'300'});
  const {data:result}=await worker.recognize(processedPath,{}, {text:true,tsv:true,blocks:true,hocr:false,pdf:false,imageColor:false,imageGrey:false,imageBinary:false});
  const lines=tsvToLines(result.tsv||'');
  await fs.writeFile(path.join(outputDir,`psm-${psm}-raw.txt`),result.text||'');
  await fs.writeFile(path.join(outputDir,`psm-${psm}-words.tsv`),result.tsv||'');
  await fs.writeFile(path.join(outputDir,`psm-${psm}-reconstructed.txt`),lines.join('\n'));
  diagnostic.runs.push({psm,confidence:result.confidence,rawLines:(result.text||'').split(/\r?\n/).filter(Boolean).length,reconstructedLines:lines.length,text:result.text,lines});
}
await worker.terminate();
await fs.writeFile(path.join(outputDir,'diagnostic.json'),JSON.stringify(diagnostic,null,2));
console.log(JSON.stringify({outputDir,original:diagnostic.original,processed:diagnostic.processed,runs:diagnostic.runs.map(({psm,confidence,rawLines,reconstructedLines})=>({psm,confidence,rawLines,reconstructedLines}))},null,2));

function tsvToLines(tsv){if(!tsv||!tsv.includes('\t'))return[];const groups=new Map;String(tsv).split(/\r?\n/).slice(1).forEach(row=>{const c=row.split('\t');if(c.length<12||c[0]!=='5'||!c[11]?.trim())return;const key=c.slice(1,5).join('.'),word={x:Number(c[6]),w:Number(c[8]),text:c.slice(11).join('\t').trim()};if(!groups.has(key))groups.set(key,[]);groups.get(key).push(word)});return[...groups.values()].map(words=>{words.sort((a,b)=>a.x-b.x);let out='',end=0;words.forEach(w=>{const gap=w.x-end;out+=(out&&gap>Math.max(14,w.w*.45)?'   ':out?' ':'')+w.text;end=w.x+w.w});return out.trim()}).filter(Boolean)}
