import {test,expect} from '@playwright/test';
import {categories} from '../../src/rules.js';
test('två mobila spelare: privat rum, låsning, återanslutning och en hel match',async({browser})=>{
 const one=await browser.newContext({viewport:{width:390,height:844}}),two=await browser.newContext({viewport:{width:390,height:844}});
 const a=await one.newPage(),b=await two.newPage();const errors=[];
 for(const p of [a,b]){p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());}
 await a.goto('/');await b.goto('/');await a.getByLabel('Vad heter du?').fill('Ada');await b.getByLabel('Vad heter du?').fill('Bo');
 await a.screenshot({path:'test-results/mobile-home.png',fullPage:true});
 await a.getByRole('button',{name:'Spela mot en vän'}).click();await a.getByRole('button',{name:'Skapa rum',exact:true}).click();
 const label=await a.getByRole('button',{name:/Kopiera rumskod/}).getAttribute('aria-label');const code=label.split(' ').at(-1);
 await b.getByRole('button',{name:'Spela mot en vän'}).click();await b.getByLabel('Rumskod',{exact:true}).fill(code);await b.getByRole('button',{name:'Anslut',exact:true}).click();
 await expect(a.getByRole('heading',{name:'Din tur att chansa.'})).toBeVisible();await expect(b.locator('#roll')).toBeDisabled();
 await a.locator('#roll').click();await a.locator('[data-die="0"]').click();
 await expect(a.locator('[data-die="0"]')).toHaveAttribute('aria-pressed','true');
 const held=await a.locator('[data-die="0"]').getAttribute('aria-label');await a.locator('#roll').click();await expect(a.locator('[data-die="0"]')).toHaveAttribute('aria-label',held);
 await a.reload();await expect(a.locator('[data-die="0"]')).toHaveAttribute('aria-pressed','true');
 await a.screenshot({path:'test-results/mobile-game.png',fullPage:true});
 expect(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 for(let i=0;i<categories.length;i++)for(const p of [a,b]){
  await expect(p.getByRole('heading',{name:'Din tur att chansa.'})).toBeVisible();
  if(!(i===0&&p===a))await p.locator('#roll').click();
  await p.locator(`[data-score="${categories[i][0]}"]`).click();
 }
 await expect(a.getByRole('button',{name:'Spela en ny duell'})).toBeVisible();await expect(b.getByRole('button',{name:'Spela en ny duell'})).toBeVisible();
 expect(errors).toEqual([]);await one.close();await two.close();
});
test('matchmaking och avbruten kö',async({browser})=>{
 const c1=await browser.newContext(),c2=await browser.newContext();const a=await c1.newPage(),b=await c2.newPage();
 await a.goto('/');await b.goto('/');await a.getByRole('button',{name:'Hitta motståndare'}).click();await expect(a.getByRole('heading',{name:'Letar efter din motståndare.'})).toBeVisible();
 await a.getByRole('button',{name:'Avbryt'}).click();await expect(a.getByRole('button',{name:'Hitta motståndare'})).toBeVisible();
 await a.getByRole('button',{name:'Hitta motståndare'}).click();await b.getByRole('button',{name:'Hitta motståndare'}).click();
 await expect(a.getByRole('heading',{name:'Din tur att chansa.'})).toBeVisible();await expect(b.locator('#roll')).toBeDisabled();
 a.on('dialog',d=>d.accept());await a.getByRole('button',{name:'Lämna match'}).click();await expect(b.getByRole('heading',{name:'Du vann duellen!'})).toBeVisible();await c1.close();await c2.close();
});
