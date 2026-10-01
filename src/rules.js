export const categories = [
 ['ones','Ettor'],['twos','Tvåor'],['threes','Treor'],['fours','Fyror'],['fives','Femmor'],['sixes','Sexor'],
 ['pair','Ett par'],['two_pairs','Två par'],['three','Tretal'],['four','Fyrtal'],['small','Liten stege'],['large','Stor stege'],['house','Kåk'],['chance','Chans'],['yatzy','Yatzy']
];
export function score(key, dice) {
 if(dice.length!==5 || dice.some(n=>!Number.isInteger(n)||n<1||n>6)) throw Error('Ogiltiga tärningar');
 const counts=Array(7).fill(0); dice.forEach(n=>counts[n]++);
 const upper=categories.slice(0,6).findIndex(([k])=>k===key);
 if(upper>=0) return counts[upper+1]*(upper+1);
 const sum=dice.reduce((a,b)=>a+b,0), groups=n=>[6,5,4,3,2,1].filter(v=>counts[v]>=n);
 switch(key){
 case 'pair': return (groups(2)[0]||0)*2;
 case 'two_pairs': return groups(2).length>=2 ? (groups(2)[0]+groups(2)[1])*2:0;
 case 'three': return (groups(3)[0]||0)*3;
 case 'four': return (groups(4)[0]||0)*4;
 case 'small': return [1,2,3,4,5].every(n=>counts[n]===1)?15:0;
 case 'large': return [2,3,4,5,6].every(n=>counts[n]===1)?20:0;
 case 'house': return counts.includes(3)&&counts.includes(2)?sum:0;
 case 'chance': return sum;
 case 'yatzy': return counts.includes(5)?50:0;
 default: throw Error('Ogiltig kategori');
 }
}
export function totals(card={}) {
 const upper=categories.slice(0,6).reduce((s,[k])=>s+(card[k]??0),0);
 const bonus=upper>=63?50:0;
 return {upper,bonus,total:Object.values(card).reduce((a,b)=>a+b,0)+bonus};
}
