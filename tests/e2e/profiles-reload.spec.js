import {test,expect} from '@playwright/test';

async function namePlayer(page,name,avatar=0){
 await page.goto('/');
 await page.getByRole('button',{name:'Starta',exact:true}).click();
 await page.getByLabel('Ditt spelarnamn').fill(name);
 await page.locator(`[data-avatar="${avatar}"]`).click();
 await expect(page.getByLabel('Ditt spelarnamn')).toHaveValue(name);
 await page.getByRole('button',{name:/Fortsätt/}).click();
 await expect(page.locator('#find')).toBeEnabled();
}

test('20 separate portraits load; name draft and selection survive reload',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.reload();
 await expect(page.locator('#start')).toBeVisible();
 await page.locator('#start').click();
 await page.getByLabel('Ditt spelarnamn').fill('Måns');
 await page.locator('[data-avatar="13"]').click();
 await expect(page.getByLabel('Ditt spelarnamn')).toHaveValue('Måns');
 await page.reload();
 await expect(page.getByLabel('Ditt spelarnamn')).toHaveValue('Måns');
 await expect(page.locator('[data-avatar="13"]')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.avatar-choice img')).toHaveCount(20);
 await expect.poll(()=>page.locator('.avatar-choice img').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>=512))).toBe(true);
 const sources=await page.locator('.avatar-choice img').evaluateAll(imgs=>imgs.map(i=>i.src));
 expect(new Set(sources).size).toBe(20);
 await page.locator('.avatar-choice img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/profiles-mobile.png',fullPage:true});
 expect(errors).toEqual([]);
});

test('lobby, information pages and friend panel restore only their current view',async({page})=>{
 await namePlayer(page,'Ada',5);
 await page.reload();await expect(page.locator('.session-name')).toContainText('Ada');
 await expect(page.locator('.lobby-profile img')).toHaveAttribute('src',/bar-brawl-06.webp$/);
 for(const [button,heading] of [['howto','Så spelar du'],['history','Historik']]){
  await page.locator('#'+button).click();await page.reload();
  await expect(page.getByRole('heading',{name:heading,exact:true})).toBeVisible();
  await page.locator('#back-info').click();
 }
 await page.locator('#friends').click();await page.getByLabel('Rumskod',{exact:true}).fill('ABCDE');
 await page.reload();await expect(page.getByLabel('Rumskod',{exact:true})).toHaveValue('ABCDE');
 // A fresh navigation still presents Starta, as requested for a new app launch.
 await page.goto('/');await expect(page.locator('#start')).toBeVisible();
});

test('waiting room and playing duel retain room, dice, holds and scores on reload',async({browser})=>{
 const c1=await browser.newContext({viewport:{width:390,height:844}}),c2=await browser.newContext({viewport:{width:390,height:844}});
 const a=await c1.newPage(),b=await c2.newPage();
 try{
  await namePlayer(a,'Ada',1);await namePlayer(b,'Bo',8);
  await a.locator('#friends').click();await a.locator('#create').click();
  const code=(await a.locator('#copy-code').innerText()).split('\n')[0];
  await a.reload();await expect(a.locator('#copy-code')).toContainText(code);
  await b.locator('#friends').click();await b.getByLabel('Rumskod',{exact:true}).fill(code);await b.getByRole('button',{name:'Anslut',exact:true}).click();
  await expect(a.locator('#roll')).toBeEnabled();await a.locator('#roll').click();
  await expect(a.locator('[data-die="0"]')).toBeEnabled();await a.locator('[data-die="0"]').click();
  await expect(a.locator('[data-die="0"]')).toHaveAttribute('aria-pressed','true');
  const before=await a.evaluate(()=>JSON.parse(sessionStorage.getItem('yatzy.view')).room);
  await a.reload();await expect(a.locator('#roll')).toBeEnabled();
  await expect(a.locator('[data-die="0"]')).toHaveAttribute('aria-pressed','true');
  const after=await a.evaluate(()=>JSON.parse(sessionStorage.getItem('yatzy.view')).room);
  for(const key of ['id','dice','held','rolls','cards','turn','avatars','version'])expect(after[key]).toEqual(before[key]);
  await expect(a.locator('.fighter-portrait img').first()).toHaveAttribute('src',/bar-brawl-02.webp$/);
  a.on('dialog',d=>d.accept());await a.locator('[data-score="chance"]').click();
  await expect(b.locator('#roll')).toBeEnabled();
  await a.reload();await expect(a.locator('#roll')).toBeDisabled();
  await expect.poll(()=>a.evaluate(()=>JSON.parse(sessionStorage.getItem('yatzy.view')).room.cards[0].chance)).toBeDefined();
  await a.screenshot({path:'test-results/match-mobile.png',fullPage:true});
  await a.locator('#restart-match').click();await expect(a.locator('.session-name')).toContainText('Ada');await a.reload();
  await expect(a.locator('.session-name')).toContainText('Ada');await expect(a.locator('.game-view')).toHaveCount(0);
 }finally{await Promise.all([c1.close(),c2.close()]);}
});
