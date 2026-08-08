import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

let source=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8').split("$('#cameraBtn')")[0].replaceAll('export ','');
source+='\n;globalThis.api={blankBill,normalize,calculate,itemTotal,parseReceipt,mergeOcrResults};';
const context={console,crypto,Date,Intl,URL,localStorage:{getItem(){return null},setItem(){}},document:{querySelector(){return null},querySelectorAll(){return[]}}};
vm.createContext(context);vm.runInContext(source,context);
const {blankBill,calculate,parseReceipt,normalize,mergeOcrResults}=context.api;
const b=blankBill();b.receiptTotal=1417;
b.items=[['Fokof Spec',2,47.5],['Americano',1,48],['Coke Zero',4,31],['Decaf Cappuccino',1,48],['Die Naguil Burger',1,159],['Halfmoon Hawaii',1,65],['Klein Cheeseburger',1,69],['Klein Horrog',1,69],['Lemonade',3,29],["N Saucy Stori",1,135],['200g Sirloin',1,159],['300g Sirloin',1,210],['Southern Fried',1,149]].map(([description,quantity,unitPrice],n)=>({id:String(n),description,quantity,unitPrice,noCharge:false,allocations:[]}));
assert.equal(calculate(b).detected,1417);assert.equal(calculate(b).difference,0);
const [me,other]=b.participants;b.items.forEach(i=>i.allocations=[me.id,other.id]);let c=calculate(b);assert.equal(c.subtotals[me.id],708.5);assert.equal(c.unallocated,0);
b.tip={mode:'percent',value:10};c=calculate(b);assert.equal(c.tip,141.7);assert.equal(c.owed[me.id],779.35);
b.tip={mode:'amount',value:100};c=calculate(b);assert.equal(c.owed[other.id],758.5);
b.items[0].allocations=[];c=calculate(b);assert.equal(c.unallocated,95);assert.equal(c.allocated,1322);
const parsed=parseReceipt('CAFE MOON\n2 x Coffee 50.00\nCake 35.00\nTOTAL R85.00\n2026-08-08');assert.equal(parsed.merchant,'CAFE MOON');assert.equal(parsed.total,85);assert.equal(parsed.items.length,2);assert.equal(parsed.items[0].unitPrice,25);
const realReceipt=`THE RESTAURANT
DESCRIPTION QTY PRICE VALUE
2 x Fokof Spec 1 95.00 95.00
Madagascar Pep n/c
Americano - De 1 48.00 48.00
Coke Zero 300m 4 31.00 124.00
Decaf Cappucci 1 48.00 48.00
Die Naguil Bur 1 159.00 159.00
Halfmoon Hawai 1 65.00 65.00
Sweet Potato F N/C
Klein Cheesebu 1 69.00 69.00
Klein Horrog 1 69.00 69.00
Lemonade 3 29.00 87.00
'N Saucy Stori 1 135.00 135.00
Side Rice n/c
200g Sirloin 1 159.00 159.00
WELL DONE n/c
300g Sirloin 1 210.00 210.00
MEDIUM N/C
Southern Fried 1 149.00 149.00
Side Fries n/c
TOTAL R1,417.00`;
const real=parseReceipt(realReceipt),charged=real.items.filter(i=>!i.noCharge);
assert.deepEqual(Array.from(charged,item=>item.totalPrice),[95,48,124,48,159,65,69,69,87,135,159,210,149]);
assert.equal(charged.reduce((sum,item)=>sum+item.totalPrice,0),1417);assert.equal(real.total,1417);
assert.equal(charged.find(i=>i.description==='Coke Zero 300m').quantity,4);assert.equal(charged.find(i=>i.description==='Coke Zero 300m').unitPrice,31);
assert.equal(charged[0].description,'Fokof Spec');assert.equal(charged[0].quantity,1);assert.equal(real.items.filter(i=>i.noCharge).length,6);
const ambiguous=parseReceipt('SHOP\nCoffee 1 30.00 30.00\nUnreadable special item\nTOTAL 50.00');assert.equal(ambiguous.items.length,2);assert.equal(ambiguous.items[1].uncertain,true);assert.equal(ambiguous.items[1].noCharge,true);
assert.throws(()=>normalize(null));const safe=normalize({...b,participants:[],items:[{description:'x',quantity:-2,unitPrice:'bad'}]});assert.equal(safe.participants.length,1);assert.equal(safe.items[0].quantity,1);
console.log('All model, sample, allocation, shared-item, tip, reconciliation, parser, and import validation tests passed.');
