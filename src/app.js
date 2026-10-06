import './style.css';
import {categories,score,totals} from './rules.js';
import {configured,local,identity,command,subscribe} from './api.js';
const root=document.querySelector('#app');

/* Lock browser pull-to-refresh on every screen while keeping normal vertical scrolling. */
let touchStartY=0;
const rootScrollTop=()=>document.scrollingElement?.scrollTop??window.scrollY??0;
document.addEventListener('touchstart',e=>{
 if(e.touches.length===1)touchStartY=e.touches[0].clientY;
},{passive:true,capture:true});
document.addEventListener('touchmove',e=>{
 if(e.touches.length!==1)return;
 const y=e.touches[0].clientY;
 if(y>touchStartY&&rootScrollTop()<=0)e.preventDefault();
},{passive:false,capture:true});
const inviteParam=new URLSearchParams(location.search).get('room');
const inviteCode=/^[A-Za-z0-9]{5}$/.test(inviteParam||'')?inviteParam.toUpperCase():'';
const playerName=()=>sessionStorage.getItem('yatzy.name')||'';
let room=null,matches=[],matchesLoading=false,busy=false,message='',friends=false,inviteSent=false,codeRoom=false,started=false,subview=null,connection=local?'Lokal duell':'Ansluter …',unsubscribe=()=>{},timer,matchesTimer,refreshBusy=false,rollingIndices=[],rollAnimationTimer;
let diceLanding=[{x:-4,y:5,rz:-7,rx:-11,ry:7},{x:2,y:-4,rz:5,rx:-8,ry:-8},{x:-2,y:7,rz:-3,rx:-12,ry:4},{x:4,y:-6,rz:7,rx:-9,ry:-6},{x:-1,y:3,rz:-5,rx:-11,ry:8}];
let selectedAvatar=Math.max(0,Math.min(19,Number(localStorage.getItem('yatzy.avatar')??0)));
let token;try{token=identity();}catch{message='Tillåt lokal lagring i webbläsaren för att kunna spela och återansluta.';}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dots={1:[5],2:[1,9],3:[1,5,9],4:[1,3,7,9],5:[1,3,5,7,9],6:[1,3,4,6,7,9]};
const AVATAR_SPRITE="data:image/webp;base64,2jbMjnv3uFAcW6CoVrGMgdjJ5ATIvgFJx1rxY1Yr8FL7nTd7ASbXBYYcAgu+turkUcRia14YP4jo13bmepnEKvnrPWgWNCRSmjpAmquHXGGFviwHMIw1YIWn0FLPHl6dxjo2Uy/g6IhaU0+JnhKt8IWexvNe+GZWqPqHYGhphf1QDdJ0Y7js6kX8YWUxF/U8SnQ/upv83C0nsbl+aF6CGkw2tB1LSSeNIRSqFsuIEMKAdRq8nHg+7HpGd5JLnkwEQM2KMYnUR2rNdsxlRLxNQ07m+nIvOuvxuATm2oWmMorSJRS9HBjN3s1ZoURKovuGEbzNZpxrvdvDf9MUPaP5DZaPzFlPUZq3PEDLn1+1bWpfvErWSp9uYsUNk786gNnoHFvjwBFpeAUaOn3/DrZliCje6sXaW2Q4xvX8lwA3cu4H5yZgmQ1vKCAfw/7g1JzEu2glRFHWbk+FgFg1K4aiX2WUaxGZ0hsSjFJ/FkR00vV3mi22WMnCXZZS/vYce6yB5qNOtFAkHYUc2haOVeGZ+JTmeaAtMuCsvpcelyRXgv2iDKy8wKab8DlH7RTiGeXW6pxdoCCMpJuB5hOdtdlSDOWtSWboKaIilPSO4HxwRuZnX+C6SudducH1fXNjjVa21/68DaTsITY0W8ol8EgfqQsgKsTIh8S4JDm1WUQ3mjCdy4Uap58tKbBSoYanFdIyNb8uhN6muuCqyMZU4bPs/ls/D/uzHHIWFfX7VHTjMyg84KGaQT8ro6sj7TxeugOZEKTHzilETrDiuLKhc2y94GLE8I0to2IbJM3KgfjNmP1l3K/a0Jvwyq4rfhaLLkPdr+1TleB5o6eit1WOGJO+Ix1ON6LLI6c8hPopKVRSQQTI+zhoOi8XptPT66HGP066UYgAD0ySOzQoHvyNK5YYSEWKCgF/AqC9zN71xKTlZ00i14iPuf+e9aGkUePmj0PpRofh3LqNlVE8XeV4wdkdnpMoGE5CupXNeiEbQzxVgKu4/XFyiMtQHaB7ZdwiAhjPiLBZhQXcjM0fgywQF6h5lZMbSm7Gx/Ff0L3pLcmX1p1H27nKtoRzd1rTDRD8lF0MoKsCiKPrifxaS+sV0neBNfPPxIANB6oorTEyGlwN9gf1N0/M8uhNUyzTWmMECI+Fl1vgZxY0lQrx8rHDVoILYBYI7i8MQM9JyZpErXaNUpBKdNE1qnv76ye8ymiDdPbeEjqAYh2+x+SgCQFXPs/MD5Nx8p227rcNjRyjuvAypI1i0njPSSLmBixHdmbrJVYbmWRSScxNVfXnsAxLJQLX8mGhb1rT/QZatDm20kWAB9XV/oHbhx9UsKGHaJittcBB5N4+DLKd9q1PKX3VNv47nLjgnP9K2+hc/AY9OZoJiu8xIL9HAL991N9k3yQObypWvJ+QJecrvNo8ZxvaPMvurxuJaI2oGSxo0ZxvxwzbWJkfOQei+OUMVlqO44b83/MfhdwyInPthIXKZQadPGHtL5wALWc3ZyKTsEbvKWwjIVvk86EM1Bc8vlNj3OoctCz+8UMH3nSsPsNH0V0kuS6yQ4eubWXz9FAAXiy19i8VTxvubEBhEJhuSMYhh3mFHpl5DJ4Kzf+Ybktheu8DTvtyJxDK/5YJEEn+q8O45MJlmmVZKp8J6fzK66/IQpbSN8jrjmWv+Huqs8erCgQkKSElgAAQBmYx53+Ys6NJUriJ+D9auaYHCAeG5ZkmBuWt77AfBESapkFpv+2Tp24Qb3Idwo62ReC8b8ZzBvPI3V64zXFCpRWwIQXPJT0PzelNDu7UdQzk2kVUFqHFGTXa6i6xvcXYdR+OOH7SeWM7pKQJWrn1yBzN6immU6rZjgIXdnm6GXBvJWOL6mSKzzBawXuBAESGS/XFO6mJw4l4xANPDU4Uwzp1yShai1DNSvlnejDAbIVvmHMmJAMfLsyEqH597keIzqOzSIXqCqx7QeVSHkhg+FGgvatI8iDOnz6rABQHdL4jDXK0Rfk+Ao+MANtYMqYyhVTprZHpUVlRdozvuV0zAwpfhDo6UrLHFkCF1czVswwJ9pclaQYimgYia21/FPgneSQaRFLTqzu8OVsVj+XgNL48HBhju9vvsBqYSy5ebwhpYtOyhV/j/Pw/SxZgOiSDEZsiBC3kgZ7GvHp78y5QVg5q7covoncy2zNt4QJcW66d+EiqXupGHIgETmkNiOMF4HE3wvk5UQdXUsdz2JDPDJx/7s5ugnuGxKGj/vvPZX7G8H/syzG6dy9PJsI5oQtZW7hEWsOvmrX9jB/9OOqTfCF84iX2F287dKRC/H8Mx/EgFfI0YCZHXop8vVH2D8rPaWeyaGuTvG4lTG4rfZB6D9pFmnAoe2Z3eCJ5wjhtKZbxq//LycxU4LFt0Nm3L6g1bDS0y1BZoT5dRDyFP8Xoza+bKJ3+Hy1YHOk/8BINgY+5tTuuwvdB+BEImZuyNUnInd5pFmpcfz/kQBvloaF8xblIvy2G7H8ky0AQD8GNRvs7mZabqpDcNKOh6W21h4SvzHXpeXEMm0hyKUYgP4qsgcIB4mZTP3cjYNwvuXwD+0memlBpaytHc3mhM75LrmCbXhOlfSR/Hi3ZmBwOXCMkUQq+9t8ohQWUc7CeNbDz/6UkIKr1jsWtYIlADdOZdcRRI9SrXOuxABIssrUc0sGPEBaZPVVaXGyMgsSYa7qRniJiPY71LZh5o19Zy45e8A9MIUZ6WybHkyIvFAOrjaGvrYnWInOgS/TYxW2RD1YBwiJ2FWApTYIwUsq1f9nOl+H3rB9hBZ+sDnaKGShjnIh7VL9EQYJb4DGI5NfxLTvL/DyXtRX7Q1jqjo2mmrOcLUV6dtAulBjJLTquB1eeWtP848b3xnsp3MmnYEZEuhTAkE9uMU6kDNKh49XGjqx8POlJzdHAAmyZx3dddKYYILFglQK/h8z9TamWfqA5ZyLWK8dIG1mP2OWZP1geb9kWnJGO3lQbiaKvTmRerL4ABMCCe9IT6o4CfXpVb4Tbl43nCQEBHND1PI+CZwLehrE0D9tk6ZMOvdJf+OfJCeQktw3gdpopOcbyRbOF9k3FfLcPw8BmQfmqwdP8GIs17eGqCOoce3a/666/ydJRG8Ta4T7ZI9kyyhiwLgoO0Jr6tf000RPS5jpOsoKV/xFTJPxtrVHFW+XbvbX4hmsCp5T6jxt+jN6kxjDkVfkauA2D68id2s1wlaWtGl1EaIGbb04kTIo2592F/lfZm49WjjCCQM6gCqF5xl52WkPaA6ZQTJuV4jkZOn8e9OmQl43ztLlqsYVOAAvYtAI5O9SsDSLqxBbfBSFa/Hsozr4FHBkeqVgLC/6DdaqTtf9PuM2Pt8YS3LX2voyLzN4b67iQ8Nn8LR23amTJCgxIJrnYueGbdHU7tsrut/zU+1YnFEzcKULPHOe9FWfOxCXLKcryslmZFWNJ5fHRl4jtySARduyOdSNJ+BlPt+KiKIDo/4bRPkAEzqZ/m01ip8jqdrRWp9aS6TfE0+uzKhIKtEwKx0W9YQB8Ai8JX/EwTQpfSxaBjgfpq8QYZj9K1jkQ8hW+T9gmJjbfx+0tKCasikX/fsIkL/HlusKB0R7jHCZ8KrUDSsnTOG6wk6jNIk9SWn5SqsJrbPeeiQqUYerLQv2RqwoCItoJ1vfyfWlkBNePzMrBDV7FiM67B392uzaMeuEb7Zpnh0QBMfoDxHkDYDH0S6EhRpeBVG18XF4yKnzSjdo5eEOn7428E/JbFDlZEI108AbmlULaa73FAnjYcTyZTxJuocAHxDEoKg2kk3y35ULlcRQh1KJ8TQZwdr9ijasGsyFtKrHOIchf771NQKiO+L/XnVdE5me4TINdAFlw0q83K+ZuKe9N0a1DX4X218gTmo1E3+kyGb2IpeSFj0vqicjXuXoo9WuNGNHF1ub2aJ8Lg6ox8AJtaWTyxv04LhiD9p7oWv/OY+OBWGqVtepOzjl3f4OfbvaUmpnsOkAK1wKyolPNn7bJ3iXr94dfBf1FhuNCBRAZMRXdKW7QPZtZvvUsb/OIhHfvb10vsHAu1LfOTenTnJ5zOnPBhK2b1fG1G/LdPyPAU4utAQ5CQJr6Wj3MXgSLfoF9WgnitlgUNVldJXNr1rAv51X52ueVFtXLAZHD/VdAUI1mLI8WoXP7d8iNrMshHexSyfOjjb9vwMpGYSaxX45hQ8fBP9rRdSsUWg4j6j2dS68RtBSVfX3OQiagJUnkGKKZA3Sh7LJcc4z9hXhcoKUFwvrkO/fV93YvUw6Q2YidcqduVSdvfX5AiApEzaGaXxndB4N7Oy3Qnt4GhRdZ4bYWnm05z8fl49k9VEusHqgvw5hoZQjmYr/mhCkFfsZjj3Tmf4RfBzFiA10qPwzg9ktaTL7e3TNpTJ4chMGN+b7hWojHIirZtiV4b/NsbRhE3cJzU/N1kG9HpDzbVWZAI59Yj/rJ9zy4OPizDHHb2/MQRPROcLSk4bpD+LknI7FAigzZC2cYub7F6CmYgMY4xpj8/LhAHDMgzJm/H9tynzxpg6RpOjx0wE+Lkp+aefyY9d3ZRtJGzkMW4O+puAr9/ra+E0nxAqchm+BOx2oIwx127t7OB7l9o1vN2RJZM6hO3rAX8n1CYkuNyd7RdwmeC/A8Tp8keb5lsdcDtU1osN58IHZNrnwwaV4smsXn32ll9mSTBQ/FC1R6fRgm4B9gtNAeEaMEzHAL5WmknI7TvUrAriSyu4S4w0sxflwy5+QFnj09VhQHku/naeN9P4R4b266T43J2KlVsweLSJwVEOLrPEGPpXcgrjlARM036+9ZGVycPBcbdh4QZo14UaH/K9d2hUX6OA2/2LuU2JJC9X4ccqLLOxQ8lDbjaZS/7ILzoyYU75pUveSqQedonehm9f4W+HwRf6Hh6GgDw0ed5Zzns4LlHq87RXSGu8pfBIV+9PcqaZ1btPzGtB9on69TyIzjBeGOcW3gEbddcTJ/mdTYQ3syZQMsBv8amL6Kzln0VWY1wBm/WOLv+ztWeCxAPPCIrDTOf4WzZsTgEF7EnUh+e6PjBrUc5joNRLECX8EylsVTn+7MEb66scfjc6uwRhqcx1W9aF3UHUVgomyqZAE+abdJw657zcdj6IVeYlZufdoy97sEP2zgNtgzqRDLtiLqbXvUzpn3KsWx1ia3/LtGK7wuYfuXNOKjHo1HeFmVTvPbJFtNc20S9+RplpnJJR15zzXUvGlPpOSrRqWpUdf8PKHn8mFaOq+Z5g27BbbBK35iiXkEvdcp0r2FpzeZ8nLeqsTjeC7RA35aqVA56uBlzBQ0i9Y17hcmIcSbOVtjoug7kMsagA4zv+j95pCkHlnG8AsptgZc/5HArahYNLs+6O+LWLUMjnsDdvRzQjX7oH9ASSso6bK6nAl/DAYVNxQrKIHoMVnugDUnx5cpFs4ZS22jp+vGtdp2xb/hO16JQbDs1EcqAyySqnFf8b2f3xYyN1Ll8soWbteTnPfD3ORRGcaV2/OQyKUujDfpHKotAPppTWUjMPXegbznm2RuG684ErCfhn/36vpSTEKA1o9YnZ0I4kK5yWCNTWDB81JDQkFTTt3OdeAtszDjfUJpKnpShYgZr2tnVbUdvsawO9V8XTH81I1iH+Y/encI0f7e2A/fze2razljcx1EdWXsGZcTy3fDemohGhiuzN3DF/jU6pT6feG7qQ4HOT/aVE05FDP9CIfVTY6/G2whngIb1GaXiT94B0pAs/6L9wpaNFRR4cVmYqU0y7ZJljMozzTv2FEbI7fbnW8CRZgpJtuXD+i6mxY8wPw7lBk0mNcJzkPsye9RzGbh4OEUq1fzU4DNTjCvxfLgh1pKY/mPg9OOJLOZ65Jt0EUho+5uVTrugXZCmBhv0FallVaOd5M2f/zqdpP14uRBaS2/xAJCtgE/7oSwEr2EcpLpHR4iMEvY3j3Ksrv4ONqVBERwFapJvou5676Ak4ElxQjeRWzwRv/Nh+eBhLub9dm4EabZTvbSuNlpMUxQbZNb9wga8lr7gjxJ6S+e9aKcKs4RDFquPCxehLSW/CJ2zaj731jKTsPSiI5INGgWrjCKySrGcdogCdwfC6pfDHzJgcEOhViuq21eZo2WNXdPGpcc9uT1r71LC6FewUMoyBVqEQ5oeYoL89mWh9vAwgqQllvk0VMZLWWkpOeCypZEP164eQs7wkbb7JiD7QuQJu13XhZD5x6JRa4lrK9LDM0z63kPVlwhBndMhkXK9zmN3zb0v8g64YBLKelxFOqKkGAZgKw23/Kw5d20aw55Vao2UIP+4MSRwG301b5oC17P1WCcRxh/3BtD+ut52G6WbgpCDOFgyKF/03dnbv9A/HY+lSgH5zUtFbusDsRmMAzQM1a+V0n7Avz6iA7znBmIfPJAlmXRaRuxlms+JKpk2538YyBTzQCRNzveH2mkzuu6dBE+BovI9wR0S8mjzDMy47DNvErM4RG+VxAhMAwH7HHA09dUEgZ8hBaFkG2W9xfzTS2ukZvj/rHg7mRwabn3DOlwG0mv2tJXFhYly4fHC3V1Mk3LocfTedaih50nqjpX79R77EapJibSU93f8VN2PDuRz0eqATsCZiXXVmda84iy+wxuqY+mlBQEDvYN+LFHBEFYiKD7vFTYet3g8TubsMcCt1DDwAgtjadJWHLAjJ9a1huh72dSLHTqmjCx/D3CryFznc8WJyK5wyex0vRtn8/x/usixHSMhBiZ5oWm7rsPYWfTaRgO0bp4QtIX3ZTawhb6d/lX2ESgt02JzdLF9xc9ZvheR+Y+lwqwWzHlfz33cfk1lN9fP95FGHKiCbK57tVXHOZXvyjS5ORsEzG1NzJTjpzVZ4ZNDVMylxPDGZ8QdWXM/tdx52+SueAuKW9+ti6uYXVR0qC5yDQ1U1Q93vErM3wLegu9PLcfcNI/iruIsh1ZjBaNg1jvonfOzIB7rt45me2uktHArYpfBooPe8S9Obz+y2BNb/b41WT9/P2nus+60BW8OuLmeuZZjK8Lept1UL2HhgAx9+3i/C3Oty+nAqeavsJ9w4QrmCiOEldpkGuFPBNP159k04gZudS7jq+ESb5doPxnwK2rhQYcAVZtuOwsKOFhsNtBC8306K9Eol8JsyTaQIJIVGqkoWs3BITQaawr6NU62z5ZphyghgB19hn+Le3bmNTmo/lQf/nGeNyKcAOUwaKReyjdVuk0ZsskVssFBIR8VeC3W2xaKQhhuu/0cQF3NML5g/pN3bgas88d5fXJOtlZej8jHX5g8/APNbpFKjho7KvW/fAC0twkdV+FEaGgYyIt9z6hTN1UCnzDKmV2zzNDbeHRvtSTH5jHaZdpnimQr18Iv7GbMWuXJEArdBGbVGdQvTD8HE7VGgGkXyz6iLfvtJXAaThueqPm5K9qmqgU9psMTtJM8gX4+X6wI2x5mkMOK2gOlS0/CNB0U2e/sB1Bcv9To1I7O/EzJl169Pk7OFkvwlwxLbnA2wgVViaheq829zvVlh97iN8enEbZTR4yyvDQ+fpuFBkwfYDldYU+XjfDxw0+OI/nbaMBeoO1PpPMUhU69X6EWF4RvkQBClwrXktmLMsxjIJoJ5d7IfXTF/0oE1/028ga+8moxbpQJDOwaXFdB9+Ni5DTNhh++sDlss7t8wEgfxqk5/ookwzSxjf7Wm61QDOzGBzJHkVlgM+/qvxuFYBdvbOAeI2Jwn7yAUd4bUV+9iBVmfJxgbXMgb4sN/BipWsUjCvRj82v7o29hWKvq16gpCKyXmDNdhWhk779RBts+Ce/hzTJxQiEbk9TXUOCNUilpiUZlCIoNDWJTnULTpZ3gfcJLtTroM/c5WN77FPmpjKomX0zXs2rGcSe7FFVcry16VTTStk4zVyXx6y3mUMif97m6bhuA6a62uDWAniSxSJncc6wHsSHB/0uWIfTgnGHqsXgtHAKt+KdJ2qPjjWBIinZ2vcy1KizRL5GPviTL2JGesBEv1avboMTbu9016uXZ2U1F6YtJbw7reBYWpSz9M5eOFxCavvf6BRuWLWL/iYQlAz17gxl9F1VgpRzo8RFjc0PhyrdYTpSIQ5HLBqYWqpIlr88p3KVktVQpNVbzqvx2IIEHoo13NIogVwqxtP+8Ki4F3Js9e1Gx1lsl5oXvzKetugiLsUZTUuQfJVspnlgWkU9QnOWULpoZelqXQ+FUU2d2sOAtaWGa3vPW2eao3IwD0cqo+lurkI0Woki6xDDfZPe7aB+12DfmXHXeOghf+GWDNYEEnu4MRlClsamLFS8byDnluZCmuP3/dEOrDLkg34eTakKpjaAG+g1Edes1N9WOMjvVRGmql3PDmF56JbvWQa9trbyKwb8xGu/zAyiCT0gDUhu5ThHhnVXwe1BKyv0o5+3tn/UGDpMFl0+eQplatUiQB+jHnoFyyQqAp5rsFGygec7tmel+a8qJF271Wpag3VnNIHsS3S1mgW1DmD6IoSdAF5Gg33/ajFdywhPQ0rg5U/NVlevFBE1MeOHLo/qIpqBHAwOROTwjSRWQCLinZSyg5vQR/AbpIoh4Huvg9BEJlir0FmbXsDo9YWt+0BK1vGzCw5kGbbWoODzXJ6Dkau8M97w5G1M0CZ/vLOJ0OMkFR6TgZyI1zopLfUqxJdxg5r5M5yxa58IKFESGKz+A85cxN1i1BM5YQ+mYydYUY8UsJ7tnC7nt9t4dwMMLR1/XSwRcJYwFhWqswJPwlvJ3tEAx9fblLD2u/JZpdSjZFiq09ZpvSQ6rffPlndd2VEIdxVf27OELNGAvIc2ww40PCQXERvRR0MWHk8gNf0wm50V/zXD+QIW3OsT0U8syGyICdqvJvqeOvNqhEAosVuEiib0EuTw/Uf9zrEOVCDrDKMnSqYMr9TrGsBxQAa3KIWpMEEoYXjqnbakjMKLALhuEvzEZlVfPCsumcv7SIqtuhoYU7OsxjOSSt+nJl4Vq2f8s4GJzXDrIuuskZk2vTOEiOMhGd92scFV5n3YH7e4XhTd7o8cRHveFOASaiTrmyG3YBucZQXVMToE7BNq6a586ACsj27e5KOJDb2Fs4bBP3/+LS/YdHA/84+rcIxQNTFGdcQX9MdoKzizkRRoZ7J5RJ38MYTsuqpJOmTPbsV7Ed+aHEQIS/3RaZRRGO6BT9fwzT1iHxtJOeGM1zGvHdEcM1jAUAbJCxm3z9YIXNewNkKIWFMo6Wo3N4XU1t4/XQf7rdScvNAuhnBcIj8OAqJa67OcEjR5N0a61dbiXBZCi44LvpiuOAe1HGtXrto+6KIAmON4Z0qtyHwkJkfUIKwOD7cLeaNIGcDOZ9ilaazo2eAI60MsYaNKLhZF2wrjw1G9TfKNTnseD8DZdyxeymhrsA1xAfeqC9nXRCzXMNpi7BL/kQGTZwYBrkcnp0Zvn3devv1M31qfLHo0oCug1z5R1zowDtl6Z78e5v/l6yethRBJHHlJU42DH6cG+npQzq1jL90c21Tl+vp8zFtGTtbgzX2GANI4EJv/83srz4x+16JWnRWg9CpITBFAqN9eAm2V+UlcyDPXeyw83dSCSrr2gaDPSKNhzsS1Klr3NeY/bpTpwiCIPCx5X/c/2MvOn6XacU5gyeIcZ/AeAa/vcMQMb6U0idJ5cHJ7OIqDUHDYbvKTdZC806XyET177zTCRO2J8jhtb2iJbHQElfAXkhdngX2u0oiYrYjTOGb/fcJcCetUQwGnmZjwzTAjuQ+5kImeLRKTBPZCwtK9RmUpkmpMUdAS02csBTLWieMN7emm20Bf7L8+cyouxd2qOBNm+S+4MlZKeGvDkFXbNce2aMceKVtnKD05BrtF+heC4qIcuvoGfL68tt59r5xKiR25WSanjgrNkaeDCNPMH2+7+YBdLX+dxtSPdTM40zkL9Ijm86HKxQ8bGpU3XzPurvSOy+mWO7UZsAHa2V1v/S2qOVqGQ3B/uUth1ZRZBCaiGFCPQU+Y0zT+AfPOQKARZZI3429VAKJyqGvk03iI5DgcbEj51J91xSD7hCfvaZQax02rorPuCveBYQqmjA6pE/jIoGJkCSvNKzUHn+V+edZxtMcCi38hYfdReX912g9lztyHWkepQ8BcdqfYsgL7XJbMbJLwceesN2IiTjs5o82w6ZWREobXW7uyumVBDPN60vjq6+xvq/+SxcgiaxfsbyIF4mOgAU1LDYx81Jn3gP1jTEztTUpnojc/oXCLBXwDZBvTzrDtCqalzxDXoN1Z6HzST9vuZLfnEgab9X6mTDp2FW2vRaQ3xTWQxJIkkrMTvYblrd4UgFx1zp9KBMu0X6WG2SX4ageAKpBff/hNYfUo+VgXzqQyIL/ou+b8lS9GfyAi5igmq0j2SKHuWwnkArMkcJnJAHQtvTOFw8g+RrfuOKvyPvO8VF5+zuZ4TMbin5Kx7RH6cduPUAIgNn1w9juaLgfIFuBw7SG2UURflo8b0AprjvK1SNfmMsE5LQG7nP4njvnQ8qtbeGnnWQl+cB9qu1kRPFj9i9GFuSWt/uPBcT+48j6VodAGL4tr8y7joBJq8QcpvORyzDVVca2gEjTyaGe7NKVWGHwHdZ+sCKG6VTiWemP8Wazz8X9ez4On8A5WSlAZBDoqkXxSDhkc76ynNDLzzTGMDZW4FY9zMzPL8J2wvby0ZWG1NFx6RaQ0Q9xgqFH3oWrC1n6A34He0FFzO8yJA2QZdGfCLzOsp2D9dJiD0Zn3eAkG4DijsCaNpyYpB/g+i7BkHOTy/YN7lY4zTSeVNE+H8JtX+IEVKkHXVaiDIQTmPpEGYVyIzgZruyfsNM8JhFrG35wF0KQiTSIwO3zB/SKmBJ121KjzpHSQqiUDEHaF8OW06RnercNxpkAQSS7pOkyL3o+4bplV1aKp4EicwCAitWL/O5Ec+WqAsWQXAwFPGDPD3J/sssXS70jxK9xqU++zHLC0VpDSQ5jSazKflzgFjYJMpLAj+T6MBQE0tKL2hXc42TrzinqVICfZNdBhSqoWjqvI37mBkx0c9Y6HQvNj+ydo4z1x66FcLfRFf8OE45E2Qo9YPeQjYKBcfnH1xxb2pY1HgBt58kX9Y09Hg00yqfwT/nkNCP4V/8ueRw7s3mEiZqck3gEiy+rgNLPZjrY8Q/R9khjuwsU2VJ5oFPYw9rhF4kFYHb3FVG7XJu4LIm5pkSMbO+QSt+7AGTD/f3blAq8bVaK6dmfkFlcNMceS6HAT7/E2PWmoQZNld5pm1hifA/rUsulPdRtdZkBlnQRG4W1jeHRoBg5pM+d2YtEPM9gHxfpP3FhferwhGkxgQ0io8jjYRcMBoTXZZPY2QTA/r5MYj7KYZu+2kjoc2gfiFxQeAWQgIYMroi26MA+YJ4eYUGseC7Wovz1omUGb9qBpK8hcBH7blgP2latScGUdNF3wBt1ze+NiT+V/WXYgUkUifQGXYmeb0v/IihWn6P8craC0pghjN0hZsOcRPeuKzFdbRfiv7rxX9N9dGKBCIfusOQTXPnKJxfIsn9EUS6VC7aiaswLNND3Xd8fWuWmiWsfkyMAxMyi7iIDpbmy24Mm8f+8hfNfrqE+6gqUkJWHgG2bO6VOr0fvwfr3k1U7dm7RhGXOz2Vbfg/8tHuEBQrkp7Boscce6Ji3xrM1Dh/bzXLmwVd10fNza0hw1ixQ2FfFHrueQbL0BPYvL0XFDwxkowu6waq6QQPFjzXHpbQnll3rDHUv1T1qMrNPKhvMuIzSS3lh/O4xVe4/wX08V5K2TYq/roK6JF887O2EvNC277Gz1EhqnuQLcdYZGD53mMTnkt8wLa+JvYBUcrrkNWr5dFTUFipoA4APuf0t+6yMZ4Z1WvLc/oM7jKW+NbADU44o5MWyIiiwTD+MqAhYsXyrstWxKwobubc2hoFPIgScmqYUXKhVXDaO3+Xrul3RwQZTpCjnFi60BWdSQyYw1EnH915F/Wslz9G414PUlBl9l0vTAV4XqLtcG7HT2K9M+nUdbYfy0sQzPoQQkP6CDG2dQeR1VvJE/mwJyKhahDiPy+56j+QXJfdzN1/Jm62fmdCsgOLR2zvJiwlBM2CzeEMwVqJdoe9jQF+jhMWENbsu0rwLm2brJOmIbjJbaV5wxpKVushoPPLso+SFKOtibOKc/GFBVWc1QDY0/Fc9aqDnt/AQlrxiEON1zz/Jt6spv1CPw6Oqcn/e60kMMNtpiqi3Eewz1BVHIJDaHOdWjVFTa7FGc3SZsXT33JHE7TXv8p8iCYHPRYSt0sFasWHNkf5VNmpisbqO0iT9/n51FRJ5P2FqRReuxSu88NBOoXLyKgltOT064xAVN/rXQaDSctur/vRYxG9I43RV8rhKeosTB9TeiZcSPRw9e8BaQIngkGp1yKGwtNZM0l4pOT/kGVYlZfDWpWIETchTFh5pHwtJwcRR8J4EK4jchjT5xWly8Jdtd1B5cP37QVdrilpsavsT+ycGk54ylTcP+hMryZkfDJOY/R6XM+uMTO24/8d5OG3VofkAvyCtpPPVdwVjzpwsZBQz1kpICiZiAX+C00kA0M+hSeRJH0G7Wa6WbiZYn8WJZINO5XVKDibwf0KoyQcAE8wbLkZrbsV3OIh89D7iwZ22MWRUnqdF4ClZe4h6KRMpCtrcr58vrs8QxqwI7gbVG/j5gA+JXtLebJM/c/uCh4D2Aew7FbrSLbVP8luRqJzj94bGpEZwwIRHobai2sR1biazfdNxQB6zTWuIyUprwwD3rFlIxycepGm0cbhQU6t3WgqkKvn/qgJxcCu/vZH+VwWJvahbCfn7TFDqoMrR4liyIrukDpQzmSZPHe3LIE7yRici7qhFHMuDsn4KUzJ6T/VmaQFXM1qNBXb1bVwH8emYh56su7ooGwglApKxDtnr8+8Rt4gpIOMeRxuLv3xVwQjn4lcs43QzQ+ijkjz5HmC61qFw8GB3U4HcoMOr61Gef/ZW+SEel95lXWFeQgZNtHlntkQEh1aSe/Xvw2eLoqrKl0uAjhBngB0QEjjPDJlGp4dHVoPNjzqy0Ht5YmgCHEULgWNObDHziiHC5emP+ZojKO+s1tUEC9GkgJmoxeIvdGtAMTxCu6KU+Za6E4RvZDkor0nffUdDRx/ft2FIItmAMs6oTIZFL7bkPlQ9mm+p6niNHrgt8YX5IfjejyOVh6KSxUzy0M0caJuuD8rhnfgEOv95fPzqF+Slxma4Ilwl4ywjs+84I7qliMmGFEiBv0NAYVFF+YogGVF6LlsH1I8zTNJOdk+zs36bhw/hPQX7kuEQlzbp+d5NwdamIipogbCgM4QQTD1U2E1mFunfcHcpBGxVolxPU0LOldxIj9cL1QOUV8sdmJ9Xypbe8BvtHPLaaubsk9NOrNVrI3Q7qubbsX5ynI0pfT+/1UgJ193S3dWBgmrIioYAiR23YOAmAiLgYON94cdcMMguR5uVMnUA3VzQcU//xjGPWOdTilF+GWRqMRzVD6MZET+jZyFDdBf9oT/LI8mZaqiiX7InY7rQpCx/c8YLTn0tja3BxGAhBS6GYTU3qUVQb7Lvfpa48KvRV8JM+1U62UZhd9258ym0YGN5wDLbIabE798F+yIvJHTgf5OHbqSQdhtC3rnwY8cTyO1DCN7tioBJ7EXm3s2lfHKBlQSajESSYxUFOqfj0ryXMxgO11WR1L8JnagkLiu9J9vMH/hCE6oPEIFUlc+Q8X1LHshwMKhvjRFhR6Krqy1j5f0yAvecE/VlZidzEj2DSTmsWCEsMe6B1q+3OHHdEE7cKs9kGl3wbfFjGL/WPyB1+hghqlwI0T+mFm8ibqCMMutKGPzzUQkjI1GZxuK/HX8f3H1nOwDRu5ucdj8VsDchMKfFhN5m0+Pv0wcC05hmwHRBszVgMGUmaz+7lSPAXpmsAbC73gsBG7JDmXopwWF/3ej+LUSc0KhkvSGWyZVqd8G13hx9aGvWwjOhOOR69T1Ce0YvW/1ONjj65kCWOF5Q5F0j6HapY8f3xsIDWOuQOGhqcUcEukcxV2J0mo7Fadmr/Nb4cXnv0zYRJwsrECD6EVNKZGrrNjxWYKdVV3z2JD1GnjVbiybNB88magOBCmy0zznDP/Km3+AibxhfEQDcKKQ+Jsi6BvqXC+40kNSJjL5GEPeIRp8u068UwA4Sj62SC28VU0yz0/ADqxH/rSqdzaFEFwPQfUQRXDCjhHXC5J+9uWBKNVtiJO59r1LxDQAqrO6TRILjAPEbp6HdLMBCx/lPTnFECPfiUnRI4BgQ/i4b5UlFSo9ExI9Rm6wdfnujUGFaRLK9tqYhlEQ+/D3k61QhYBjqshAXT7kEL/In9ek6145BZ/j5JICwZ0eELwqJSAiNCb/p/a3b+S171ZirIwwnJ7i7edoX8P+YBtNdL8iv4ZAS3tZJadQNiap0BrzQCbLdPHpwFcwx6l8RJ2uB3HguebqHAwM6JftGi3sgwDuxqlsnZ4lwClwB+aJoX+joRyeMV8F7Bh3PG+sLUyleeO5r3LZFluQLbvufDXNHoZMPqxArwKI7R7sGzS6xuJvtHuci24MsOFqKnf1z/0nYZepPmFGnlPI0AwfZX6DNQ/s7/jr78xEgz5cin5dR6wq5Mx7RiOa/7vIJlWSNchdDJXWDKDyyqZl91VWFgmf1+cGHrJmt6Ss8XSPT8AQ156HjBbg/FGFrKqy/hNr99pcdu9CY1iFPhPv1vGmZR+2FTE5M6HJVHrlf4JmgfAPocK1oXlA+ARTDO52nC2hjUHln+d4Jn9RrP+9IOhycpzCkTt+OPlAgRdmLRAC1zUIUuw2XArN0uwmzRwunjKIag+Vywm+LQdtEes1mVZsf7Zx+XZVVWES9EltS2M71jDim/Iw3Tu9ekXvDi2fVIsUXvX+C9wM49lHMiHBhpaLdg06Y/vL1frh+2VomsQLTAJmTbf8aaANf80gZIu9eYbormGL1fKCUOVqSTD/h5soecdbiKw7UQdwM5+GcoVaEWg+hI+k+XD9Kme11Ub9lzIJNu38pP5YwTsHOTX57vyAyrC1XR4fucYJPW4gTmCIKpbPjzzIbNXEMdnWFo+lFuR+kS7eIdJ11cs16xizJrJGMw/Jh7RcKNjjTQOD8+t68Z/wy1AQtIwVz4uDnAL5NuAgzdt9dAUOU5q3m+FnwErjtE4YlnvWQwX3Ct9nUzxsEqCblc0HIWkFl0ogD9aqpUubuvjJ/U6NlAa9C01WNdNbqZI5DT0eI6bXr1aoDTYzWtuxrY79GYiUpwJ2+31O8U1w6iSGRDGdPUyijyiRZPN3U+zD/ZK0RCmu8pidi1p3WnTFlv2LC8E5KgyKDFf0mm66ipveby0OSGa9nEWr2bNfkdYCCn/KUJc+EsopG9tOHHkuShtY/HYLDsBy+UKUy36i8XNsLUBM5PykAyIas/KbIzqdUjBMOP/7316JRrrazP9pac7qHuLNbwnfgdCfjVBdaRQp/+gaUvJYXPjdm01pBPvGU/Cb+1SDpsJST2Z10C8Ae2ayCFIutcBDNs554YnTDswDH9irtcc4xwLQcDEuKKCPDBHsf2BlEc1Vb1aseNYD6TcH5JWFf0acxS8d8ugjM4sO/Xszoh4j0TNT1w4zh4hoJu7lhQDqJoDcjYiDvk//wRCc43qTPGZlvXaontfvGcIgAIXJLxN2yz4pXulqHeMUPTP7PXq4+VHJOtzBwwFX7PrmRq4Thz1MhVI0MWNL8vxz+sG1IP5G98tcyVJCsOQGf2pBqb0UVUB1V4vkAcy9e4MF56yq7u2/le+Y5f7u7PSnYHpmX+CFGPevoqrncDohAk8lj1KOjujkJSNcnuXfatrUnhOlRxwAL25EPwkpnlcP/5Vyy0NyMpuWj9OQu9RpTwI/ks0+gocTUCJikeanwrGl765BXEbk2RD+Nml+jg/l8YK8BfgEz1go6oiyGsQlsN1XZvGmBrnMN6MNKLe0RRcEWz2gKveiLUWSSucheFbQcwdxueNarBdQlgjyhubsN9FtzRiHiPyfBPO3OccWAW3OcxlAPkHa7g8wQbfNkB+4kOCTF9JJTPYwOBEtNQRh7Ngvy1FPqDrcy5d1YmUxBPo+PinijmSG8t9Q6E+W40y+XW6tG/+tvSBHyM5Syujw8gmDboO0mZ5RVmiP7Sx8TI1GwjilAu/9ytCcePYuG5DebNvd2oniQDuPJnQaYpkE7D6oQU6dH0bBa2d9BrTB1e+V/Xr45SHhNmrh56nSPeDfcVDYUeALGbY5iggm1eEnZ5ctZXT4mtuZYEDPTe1nlOddRPwvcxlyUTqhDt5jLTGrVCTkYikYwH97oDNrG3lF9QHQVCkip6SYQodNgsjFw5owIZ3o8XM4j9keOcRj1bsMuNnyG/cLOsV6SBYzEbn2Hl6YN3BYNWgSK0wQKLxMH/q/yjJiuQkf/W1lTv4smSwJiX+hX3uZuobURwJW+yl12KlBrNgeKk7uhKyyuliXXT9gR5I2jOVfz1pOYw6aXbVim73Ph/+k0mMSeYEU2k06GC9UOHk6YA9ftE1xCVBOqN7BX22kxy8wGqYaYbz7BoC2fm4FFIGhDbg4XoOKsalNO6NV6VfzBn3GXUDEViCqvntyueXxa0kFCz0y4JoBZUoXlZ9OrSqTqa39/tjQvLRO1WcKzG9dtb9IyhjWWqGp59L+yegaqC4knKUz0h99Tna8o//9uxeQWJIAVkAuIi9x9HUeC/rZhOuOARlQKqUIalxkid4oQGUR0UkGkjZfC/kjdafO+6dJg44mqMb11mjmcuENH4F5pSjMBOuhWkUkGd8DxBjj3u84z3xoRBnduFsqrqWotldZkl/V2FkF3ktncmmMWKnmpB/kpfKmv4xkXbcL0nrAb6m4VQFoht6C/+gr7fMUnhKqqicDpWFyo3TppFueBPAoSSxh1B8oneByCTADKIdUO77RaLsz8gwTE3CBHexM/NINosC5RzFgDuySm5Q3PD5IrPvt5X4LSNssGp+ECfDjiANwMNBgZVAPdkCqpPX6v/CvN+wgAnB8L4eej8IrNcCjFzMjLhnDIl1p4ZDueg1mJNURlGF4mUyThzYaeEuN+r8Sk3R0SLxOJUjc7EmdE4sLzpZOmWFrflOtGj0C8rW+WIS90VsfhAwaZq/JMbAKVMP0SpF3qGh3eMP4GP4QGFi0h6qkyGYHXaqN1SGXM8hSwPRlW7OtL60WI88Hl4pO7lWHl+QUq6d59JixQmGIexzPaiRAEwUqzyG51TY+k3CV+e+gUXci0VxodGZj+UY22kxJrkox0pW5UOwCDrYYMexgMjrnLRPTOMn2LzrEdTVv3YkZtQ8RETgaFd0Lklv4u65Y5earsRmUkc1myXc8dDKZsQ2ztkayaO1zNqN6LZ2W/5PJzcJ00xxM0CRZmUonZogqBFPWMpi4N+JracM0CU3kYXfeKnTZGWAqMsKwwOseLy3dpQyjYHbAhof4opbgYGlbP7dui3cYchAOuzpH+nCpheP3WHVaOjHxSzla9tQdm6fWbdh5w/SC6LLzIF13RELCVGgSDiRE/+qOAiYbjN7PQEeRIV5DkwPouiK4abaBjQeS4VV3rKEofzDDw628WW+Nprm3WEx5bITvBW/NQ0wPDhqrxglG0Ui3xCQEQEDfxyuokqPyp/9IapP+nDupjJJ40vgDindtwHDnkQtBH8ButActyooOmS2zCe1e4T0Ux0IyfulA/laqgKtwEjbUUEhnpv0B9wExK0fuM7BfRyysXcVYEwPHIiBcQ5dbd2G4N0/VM322Ix6phTGegVNASSOLYmFHuV7dBtFv8KcqBj8XVUVAocOV1e+sLqZzeV9T3zta/hdnjEsF2fPsbwavqwHTfmvCt2GrbfakkImlwxkW6xW9EkFkJUuhN/RkVwBbbUOCKjNNpkc5eo5hyNl80fMIEqL+vKrpWaPjeD6qvwUaIbfIBTicVrOeVbEf9aMBWzRXaxUZlrGmK9DzXZnN0CBDwmqQTx4A8TTt9nChN+wPOQrVN+l9XRLk0NdN/MSsJtY0w9uP4Ev/1RUcQNgv8wtY6Lrbq745/73N9xaBJGVv5uxleJCb2dHwFubzCEt/XiK0HpmuTnpQ1PNd7TjMfXTwAeLmLAogZVryPS1W1Uh9OpLQp+IbDllOpJlQtWneUXIyaLKZX+8GWrpyqGoHyuePqCB7XIwIE0u1FY2Fwg0Lnp9FZedHsfzWhhJTtKC/Vh3gKdm3NV7ONePTYiOLD5S6mTSXLQnASZNL7RoFIHpGvLyMb4y5WS+qMDOyNLq8vVKHpSSZxJOrR49D9PpTEkN6lb9+rNfnAz6zUaYvISUu0kMgLINRGZFNT65Bw0wbPOdiNNsrmldpq8PT1xFWbDlGiYa2XYH4jHzE2+1sT3rsYHftWpJt5/Q+7eo7Whcp9wrAaxvn8zUtrnz7dFCOxWg3Esksy4Lz1gTnXTaWqSxiC3FEYTpdt51IC0TxNLfjthq3YYQadLs/tza4IACAaxJSbdq4l1mj9foNDgHJLTJx5VoHETaWrhjqWpNTxuT1/j2xlr59bqkNERBZT8f1Fh74XKPOWyhrqHTbm2eKRnPh7djig1xhzsW5nJFAKteU7RuM0Ca48t0NcyQkA61/piWfhwOpeNcVJUd5c7Zh9W2YZ4TpUR+SgBvX5BcwAx4q7KivcgHlCuyhaGZmlgt0zalDhQ72APP/0xN6uUZ3CGtjFR0mFSvmxw0y+IGPCEb9hZYISxeyUUCvMD4vsac8g2hIh/sIy7TY/1Nbxb2jdYedV3t1J10Gs+ViETKLBTqz7kR4ttnhUnN43q4yHaF9ZoWykeeSRODWMfZ4QT9hlu6z05QplB1Ki4eC4IG9Um/9ovRLvvYAAAnkQGfVfzkZUglfiSLVYcicACbBmObC7biHTg6UKwKPwkLAKQNMvQZscZq1xhLV4XOJNOsGKFUtNn2DykzjO03oOC1fzxszawz6wVXvjqOLf9/YIsb2YKEl/oI8D3+2la0U74/X+dFuFF2wkjuSqlhvErdFP1jrmMRYmZmExy00g6MaCrQ8oQC20af02wm7MumeDJZSnA/DvfphRdbIUkl6wiLIve59zkq4glxg6QvIAAHxpEdtCHIBEXhgMt94HLs4BIp0AkkVJ/c/yIrs/o5SUy4oBPA1xhDdDNTNaNqdiPiTE3zvX1YAt86nL5jNn2doE5k0uno29gX8nZaqLUdA0Xf8ejhkjSKxbwOlAdj39cC1J0Z0Sambulry4cjDS2a7N3SC4X60+2brt6ow9slE4YQwwoJKYaW0DAlmAaMo+oD/wNsWIkTvsQ9aE173ZXNxFI2jq7Hy/r7/59+a6K/HZFSX+zQQ6J24F5jkwkAN5/W7dIexAhtHD5p7RmJUN5brs1btDoAAABVTFHBz/7e7NYpv46YqkQwvmKTj0DfeEK/Df9yZb04fUIcIjPxsGA2Ntp6K5E6w61dt5XTQNXlvKeTg+WEYu8s3bYx8nyLU1F/AW2koT3vGICdueHr/C3PP1WIH/NCHni6mYQMNTLkUmgLrz/ukn94JatkzjcNkU51LEF7DqBBEWWXOEjYP8HgrL8ujPXldd3pAFg6KjtJbk2yTQkmpIiGKOOUDMDppIfYruO3wMEcI5rFgdTSFQQhvBnZts+4QsP4SFTI2t79PLHkq3AR2+hr2cBgcTM79BGrgu5PoBFc1+eZySfAhF5FuQy7WN9y3Nj4z/HdCa7W+1fBopO3r79tNAxLgigxTOi7g3Ml2Db63DNhq3Ye+jEhReKP9A3TzBpgepYmgDd5DRxy0tAGXh9hxjZWjkPNzTZnzZUTACFQwdf/G0lEJWpoBEaRsoGyNAksjKdJ/n+157vKAz7vPVIrmBhuJpK3FwKXjX4nLeajEBOxZxTtVS2dwBw2Umg6XatIH1XrJCpBHv8GTvwsssJU2YMcpYS0p1JePT5tdJreQQPdw/MZUIvdJ9iyXnAeQ02kt3omUwvDm8ZX7kzjzZ48N++8tEzCe+WIdilwwCZOXSgVKUFETxD2DLwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
function avatarStyle(id){
 const i=Math.max(0,Math.min(19,Number(id)||0));
 const col=i%5,row=Math.floor(i/5);
 return `--avatar-x:${col*25}%;--avatar-y:${row*(100/3)}%;background-image:url("${AVATAR_SPRITE}")`;
}
function avatarArt(id){
 return `<span class="avatar-art" style="${avatarStyle(id)}" aria-hidden="true"></span>`;
}
function avatarPicker(){
 return `<div class="avatar-picker"><h3>Välj din profil</h3><div class="avatar-grid mixed">${Array.from({length:20},(_,i)=>`<button type="button" class="avatar-choice ${selectedAvatar===i?'selected':''}" data-avatar="${i}" aria-label="Profil ${i+1}">${avatarArt(i)}</button>`).join('')}</div></div>`;
}
function roomAvatar(i){return room?.avatars?.[i]??(i?10:0);}

function randomLanding(index){
 const jitter=(min,max)=>Math.round(min+Math.random()*(max-min));
 return {x:jitter(-5,5),y:jitter(-9,9),rz:jitter(-10,10),rx:jitter(-14,-6),ry:jitter(-10,10),throwX:(index-2)*18+jitter(-12,12)};
}
function die(n,held=false,index=null,disabled=false,rollOrder=-1){
 const rolling=rollOrder>=0,p=index===null?null:diceLanding[index];
 const style=p?`style="--tx:${p.x}px;--ty:${p.y}px;--rz:${p.rz}deg;--rx:${p.rx}deg;--ry:${p.ry}deg;--throw-x:${p.throwX??0}px;--roll-order:${Math.max(0,rollOrder)}"`:'';
 return `<button class="die ${held?'held':''} ${rolling?'rolling':''}" ${style} ${index===null?'tabindex="-1" aria-hidden="true"':`data-die="${index}" aria-label="Tärning ${index+1}: ${n}${held?', låst':''}" aria-pressed="${held}"`} ${disabled?'disabled':''}>${Array.from({length:9},(_,i)=>`<i class="${dots[n].includes(i+1)?'pip':''}"></i>`).join('')}${index!==null?`<span>${held?'LÅST':' '}</span>`:''}</button>`;
}
function render(){
 const playing=room&&room.status!=='waiting', myTurn=room?.turn===room?.seat&&room?.status==='playing';
 root.innerHTML=`<header><a href="${import.meta.env.BASE_URL}" aria-label="Yatzy startsida" id="brand"><span class="brand-icon">⚄</span> yatzy<span class="brand-dot">.</span></a><span class="edition">BARA DUELLER. ALLTID TVÅ.</span><span class="connection"><i></i>${room?esc(connection):'EN DUELL TILL'}</span></header><main>${!room?(subview?infoView(subview):home()):playing?game(myTurn):codeRoom?codeWaiting():waiting()}</main><div class="message" role="status" aria-live="polite">${esc(message)}</div><footer><span>FEM TÄRNINGAR. TVÅ SPELARE.</span><span>Lite tur. Mycket magkänsla.</span></footer>`;
 root.querySelector('#brand').onclick=e=>{if(room){e.preventDefault();message='Din match är kvar. Använd Lämna match för att avsluta.';render();}};
 bind('#start',()=>enterApp());
 bind('#back-start',()=>{started=false;subview=null;message='';render();});
 bind('#back-lobby',()=>{friends=false;subview=null;message='';render();});
 bind('#back-info',()=>{subview=null;message='';render();});
 bind('#back-matches',()=>closeRoom());
 root.querySelector('#name-form')?.addEventListener('submit',e=>{e.preventDefault();saveNameAndContinue();});
 bind('#friends',()=>{friends=!friends;render();});
 bind('#howto',()=>{subview='howto';message='';render();});
 bind('#history',()=>{subview='history';message='';render();});
 bind('#create',()=>createCodeRoom());bind('#find',()=>enter('find'));
 bind('#share',()=>createAndShare());bind('#share-room',()=>shareRoom());
 bind('#copy-code',async()=>{try{await navigator.clipboard.writeText(room.code);message='Koden är kopierad.';}catch{message=`Koden är ${room.code}.`;}render();});
 root.querySelector('#join-form')?.addEventListener('submit',e=>{e.preventDefault();enter('join');});
 bind('#roll',()=>act('roll'));bind('#leave',()=>{if(room.status==='waiting'||confirm('Lämna duellen? Om matchen har börjat vinner motståndaren.'))act('leave');});
 bind('#home',()=>closeRoom());
 bind('#restart-match',()=>endMatchAndLobby());
 root.querySelectorAll('[data-match]').forEach(el=>el.onclick=()=>openMatch(el.dataset.match));
 root.querySelectorAll('[data-avatar]').forEach(el=>el.onclick=()=>{selectedAvatar=Number(el.dataset.avatar);localStorage.setItem('yatzy.avatar',String(selectedAvatar));render();});
 root.querySelectorAll('[data-die]').forEach(el=>el.onclick=()=>act('hold',{index:Number(el.dataset.die)}));
 root.querySelectorAll('[data-score]').forEach(el=>el.onclick=()=>{const category=el.dataset.score,points=score(category,room.dice);if(points!==0||confirm('Stryk kategorin och få 0 poäng?'))act('score',{category});});
}
function bind(selector,fn){const el=root.querySelector(selector);if(el)el.onclick=fn;}
function home(){return started?(playerName()?lobby():nameStep()):splash();}
function splash(){return `<section class="splash splash-art"><button id="start" class="start-hotspot" aria-label="Starta"></button></section>`;}
function nameStep(){return `<section class="lobby-screen"><section class="lobby tavern-menu name-step"><button id="back-start" class="view-back" type="button" aria-label="Tillbaka till startsidan">‹ Tillbaka</button><div class="menu-crest" aria-hidden="true"><span>⚄</span><i></i><span>⚂</span></div><h2>Vad heter du?</h2><div class="menu-rule" aria-hidden="true"><span>◆</span></div>${inviteCode?'<p class="invite-note">Du har fått en matchlänk. Ange ditt namn så ansluter du direkt till rummet.</p>':'<p class="name-note">Namnet används under den här sessionen.</p>'}<form id="name-form"><input id="name" maxlength="20" autocomplete="nickname" placeholder="Ditt spelarnamn" autofocus required>${avatarPicker()}<button class="primary menu-primary">Fortsätt <span>›</span></button></form></section></section>`;}
function lobby(){const pending=matches.filter(m=>m.status==='playing'&&m.turn===m.seat).length;return `<section class="lobby-screen"><section class="lobby tavern-menu"><div class="lobby-profile" aria-label="Vald profil">${avatarArt(selectedAvatar)}</div><h2>Din nästa duell<br>börjar här.</h2><div class="menu-rule" aria-hidden="true"><span>◆</span></div><p class="session-name">Spelar som <strong>${esc(playerName())}</strong></p>${matchList(pending)}<button id="find" class="primary menu-primary" ${!configured||busy||!token?'disabled':''}><span>Hitta motståndare</span><span>›</span></button><div class="divider"><span>ELLER</span></div><button id="friends" class="secondary menu-secondary" ${!configured||busy||!token?'disabled':''}><span class="friends-icon" aria-hidden="true">●●</span><span>Spela mot en vän</span><span>›</span></button>${friends?`<div class="friend-panel"><button id="back-lobby" class="view-back inline-back" type="button">‹ Tillbaka</button><button id="create" class="primary" ${busy?'disabled':''}>Skapa rum</button><form id="join-form"><label for="code">Har du en rumskod?</label><div class="join"><input id="code" aria-label="Rumskod" placeholder="ABCDE" pattern="[A-Za-z0-9]{5}" maxlength="5" minlength="5" required autocomplete="off"><button ${busy?'disabled':''}>Anslut</button></div></form></div>`:''}<button id="share" class="secondary share-link" ${!configured||busy||!token?'disabled':''}><span class="share-icon" aria-hidden="true">↗</span><span><strong>Dela länk</strong><small>Bjud in en vän via länk till en duell</small></span><span>›</span></button><div class="menu-bottom"><button type="button" id="howto" class="menu-link"><span aria-hidden="true">▤</span>Så spelar du<b>›</b></button><button type="button" id="history" class="menu-link"><span aria-hidden="true">◷</span>Historik<b>›</b></button></div>${!configured?'<p class="setup">Online behöver kopplas till Supabase. Starta med <code>npm run dev:local</code> för att testa en lokal duell med två spelare.</p>':''}${local?'<p class="local-note">Lokal testmiljö · öppna även ett privat webbläsarfönster för spelare två.</p>':''}</section></section>`;}
function matchList(pending){
 if(matchesLoading&&!matches.length)return '<div class="match-list loading-matches">Hämtar dina matcher …</div>';
 if(!matches.length)return '';
 return `<section class="match-list"><div class="match-list-title"><h3>Dina matcher</h3>${pending?`<span class="turn-badge">${pending} din tur</span>`:''}</div><div class="match-items">${matches.map(m=>{
  const other=m.names.length>1?m.names[1-m.seat]:'Väntar på motståndare';
  const mine=totals(m.cards[m.seat]||{}).total;
  const theirs=m.names.length>1?totals(m.cards[1-m.seat]||{}).total:null;
  const waiting=m.status==='waiting';
  const myTurn=m.status==='playing'&&m.turn===m.seat;
  const left=timeLeft(m);
  const status=waiting?'Inbjudan väntar':myTurn?`Din tur${left?' · '+left:''}`:`Väntar på ${esc(other)}`;
  return `<button class="match-item ${myTurn?'your-turn':''}" data-match="${m.id}"><span class="match-opponent">${esc(other)}</span><span class="match-status">${status}</span><strong>${waiting?'—':mine+'–'+theirs}</strong><span class="match-arrow">›</span></button>`;
 }).join('')}</div></section>`;
}
function timeLeft(m){
 if(!m.deadline_at||m.status!=='playing'||m.turn!==m.seat)return '';
 const ms=new Date(m.deadline_at).getTime()-Date.now();
 if(ms<=0)return 'tiden ute';
 const min=Math.max(1,Math.ceil(ms/60000));
 return min>=60?'60 min kvar':min+' min kvar';
}
function infoView(kind){
 if(kind==='howto')return `<section class="lobby-screen"><section class="lobby tavern-menu info-page"><button id="back-info" class="view-back" type="button">‹ Tillbaka</button><div class="menu-crest" aria-hidden="true"><span>⚄</span><i></i><span>⚂</span></div><h2>Så spelar du</h2><div class="menu-rule" aria-hidden="true"><span>◆</span></div><p>Varje spelare har upp till tre kast per tur. Efter första och andra kastet kan du låsa de tärningar du vill behålla och kasta om resten.</p><p>När du är nöjd väljer du en ledig kategori i protokollet. Varje kategori kan användas en gång. Bonusen är 50 poäng när Ettor–Sexor tillsammans når minst 63 poäng.</p><p>Efter att båda spelarna gjort ett slag jämförs poängen i omgången. Den som fick minst förlorar poängskillnaden från sin energibar. Båda börjar på 50 energi.</p><p>När energin når 0 blir spelaren knockad och står över nästa slag. Därefter återställs energin till 45, sedan 40, 35 och så vidare. Blir du knockad på nivån 5 förlorar du matchen direkt.</p><p>Om ingen slås ut är duellen klar när båda spelarna fyllt alla 15 kategorier. Högst totalpoäng vinner.</p></section></section>`;
 return `<section class="lobby-screen"><section class="lobby tavern-menu info-page"><button id="back-info" class="view-back" type="button">‹ Tillbaka</button><div class="menu-crest" aria-hidden="true"><span>⚄</span><i></i><span>⚂</span></div><h2>Historik</h2><div class="menu-rule" aria-hidden="true"><span>◆</span></div><p>Matchhistorik kommer i nästa steg.</p></section></section>`;
}
function codeWaiting(){return `<section class="lobby-screen"><section class="lobby tavern-menu code-room"><button id="back-matches" class="view-back" type="button">‹ Dina matcher</button><div class="menu-crest" aria-hidden="true"><span>⚄</span><i></i><span>⚂</span></div><p class="eyebrow">PRIVAT DUELL</p><h2>Din rumskod</h2><div class="menu-rule" aria-hidden="true"><span>◆</span></div><p class="code-help">Ge koden till din vän. När den skrivs in startar matchen automatiskt.</p><button id="copy-code" class="room-code-simple" aria-label="Kopiera rumskod">${room.code}<small>TRYCK FÖR ATT KOPIERA</small></button><button id="leave" class="text-button" ${busy?'disabled':''}>Avbryt</button></section></section>`;}
function waiting(){return `<section class="waiting-screen"><section class="waiting tavern-menu ${room.mode==='private'?'private-waiting':'online-waiting'}"><button id="back-matches" class="view-back" type="button">‹ Dina matcher</button><div class="menu-crest" aria-hidden="true"><span>⚄</span><i></i><span>⚂</span></div><p class="eyebrow">${room.mode==='online'?'MATCHMAKING':'DIN PRIVATA DUELL'}</p><h1>${room.mode==='online'?'Letar efter<br>din motståndare.':'En plats kvar.<br>Bjud in en vän.'}</h1><div class="menu-rule" aria-hidden="true"><span>◆</span></div><p>${room.mode==='online'?'Matchen börjar så snart ni är två.':'Dela matchlänken med din vän. När länken öppnas och namnet är angivet ansluts vännen direkt till rummet.'}</p>${room.mode==='private'?`<button id="share-room" class="primary waiting-share ${inviteSent?'sent':''}">${inviteSent?'Inbjudan skickad <span>✓</span>':'Dela matchlänk <span>↗</span>'}</button>`:'<div class="pulse">● ● ●</div>'}<button id="leave" class="text-button" ${busy?'disabled':''}>Avbryt</button></section></section>`;}
function scoreRows(list,mine,other,myTurn){
 return list.map(([key,label])=>`<tr><th>${label}</th><td>${mine[key]!==undefined?`<b>${mine[key]}</b>`:myTurn&&room.rolls>0?`<button data-score="${key}" aria-label="Välj ${label}, ${score(key,room.dice)} poäng" ${busy?'disabled':''}>${score(key,room.dice)} <span>＋</span></button>`:'<span class="empty">—</span>'}</td><td>${room.cards[other][key]??'<span class="empty">—</span>'}</td></tr>`).join('');
}
function scoreTableHead(other){
 return `<thead><tr><th>Kategori</th><th>${esc(room.names[room.seat])}<small>DU</small></th><th>${esc(room.names[other])}</th></tr></thead>`;
}
function energyBar(i){
 const energy=room.energy?.[i]??50,max=room.energy_max?.[i]??50;
 const width=max>0?Math.max(0,Math.min(100,(energy/max)*100)):0;
 const state=energy===0?'knocked':energy<=Math.max(10,max*.25)?'danger':'';
 return `<div class="energy-player ${state}"><div class="energy-label"><span>${esc(room.names[i])}${i===room.seat?' (du)':''}</span><strong>${energy} / ${max}</strong></div><div class="energy-track" role="meter" aria-label="Energi för ${esc(room.names[i])}" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${energy}"><i style="width:${width}%"></i></div></div>`;
}
function combatNotice(){
 if(room.status==='knockout')return `<div class="combat-notice knockout">💥 ${esc(room.names[1-room.winner])} är utslagen. ${esc(room.names[room.winner])} vinner på knockout!</div>`;
 if(room.last_skip!==null&&room.last_skip!==undefined)return `<div class="combat-notice">🥴 ${esc(room.names[room.last_skip])} blev knockad och stod över ett slag. Energin återställdes till ${room.energy?.[room.last_skip]??0}.</div>`;
 if((room.last_damage??0)>0&&room.last_damaged!==null&&room.last_damaged!==undefined)return `<div class="combat-notice">⚡ ${esc(room.names[room.last_damaged])} förlorade ${room.last_damage} energi.</div>`;
 return '';
}
function game(myTurn){
 const mine=room.cards[room.seat],other=1-room.seat,done=['finished','abandoned','timeout','knockout'].includes(room.status);
 const heading=done?(room.winner===null?'Oavgjort!':room.winner===room.seat?'Du vann duellen!':`${esc(room.names[room.winner])} vann!`):myTurn?'Din tur att chansa.':`${esc(room.names[room.turn])} kastar.`;
 const upper=categories.slice(0,6),lower=categories.slice(6);
 const doneText=room.status==='knockout'?'Matchen avgjordes på knockout.':room.status==='abandoned'?'Duellen avslutades när en spelare lämnade.':room.status==='timeout'?'Matchen avslutades efter en timme utan nytt drag. Motståndaren vann på tidsgräns.':'Alla kast är gjorda. Tack för en god match!';
 return `<section class="game-view"><div class="game-utility-bar"><button id="restart-match" class="restart-match" ${busy?'disabled':''}>${done?'Till lobbyn':'Avsluta match'}</button></div><div class="duel-logo"><strong>YATZY</strong><span>DUELL</span><i>⚄ ⚂</i></div><section class="game-heading"><div><p class="eyebrow">DUELL / ${room.code}</p><h1>${heading}</h1><p>${done?doneText:myTurn?'Kasta tärningarna och välj var poängen gör mest nytta.':'Följ kasten live. Snart är det din tur.'}</p></div>${done?'<button id="home" class="secondary">Till dina matcher ↗</button>':`<div class="game-actions"><button id="back-matches" class="text-button">Dina matcher</button><button id="leave" class="text-button" ${busy?'disabled':''}>Lämna match</button></div>`}</section><div class="game-grid"><section class="table card"><div class="table-top"><span>${done?'SLUTRESULTAT':myTurn?'DITT KAST':'MOTSTÅNDARENS KAST'}</span><span>${room.rolls} / 3 KAST</span></div><div class="player-duel-cards">${room.names.map((name,i)=>`<div class="duel-player-card ${i===room.turn&&!done?'active':''} ${i===room.seat?'me':''}"><div class="fighter-portrait" aria-hidden="true">${avatarArt(roomAvatar(i))}</div><div class="duel-player-content"><div class="duel-player-top"><span>${i===room.seat?'♛ ':''}${esc(name)}${i===room.seat?' (du)':''}</span><strong>${totals(room.cards[i]).total}<small> poäng</small></strong></div>${energyBar(i)}</div></div>`).join('')}</div>${combatNotice()}<div class="dice-tray"><div class="dice-row">${room.dice.map((n,i)=>die(n,room.held[i],i,!myTurn||busy||room.rolls===0||room.rolls===3,rollingIndices.indexOf(i))).join('')}</div></div><p class="dice-help">${done?'Sugen på revansch? Starta en ny duell.':room.rolls===0?'Dags att låta tärningarna tala.':'Tryck på en tärning för att låsa eller låsa upp den.'}</p><button id="roll" class="primary roll" ${!myTurn||busy||room.rolls>=3||room.held.every(Boolean)?'disabled':''}>${room.rolls===0?'Kasta tärningarna':room.rolls===3?'Välj en kategori →':'Kasta igen'} <span>⚄</span></button><div class="score-summary compact-summary">${room.names.map((name,i)=>`<div class="${i===room.turn&&!done?'active':''}"><span>${esc(name)}${i===room.seat?' (du)':''}</span><strong>${totals(room.cards[i]).total}<small> poäng</small></strong><small>${Object.keys(room.cards[i]).length} av 15 kategorier</small></div>`).join('')}</div></section><section class="scorecard card"><div class="score-title"><h2>Protokollet</h2><span>15 KATEGORIER</span></div><div class="score-columns"><table>${scoreTableHead(other)}<tbody>${scoreRows(upper,mine,other,myTurn)}<tr class="bonus"><th>Summa övre</th><td>${totals(mine).upper}</td><td>${totals(room.cards[other]).upper}</td></tr><tr class="bonus"><th>Bonus <small>63 → +50</small></th><td>${totals(mine).bonus}</td><td>${totals(room.cards[other]).bonus}</td></tr></tbody></table><table>${scoreTableHead(other)}<tbody>${scoreRows(lower,mine,other,myTurn)}</tbody><tfoot><tr><th>Totalt</th><td>${totals(mine).total}</td><td>${totals(room.cards[other]).total}</td></tr></tfoot></table></div></section></div></section>`;
}
function apply(next){
 if(room&&next.id===room.id&&next.version<room.version)return;
 room=next;
 localStorage.setItem('yatzy.room',room.id);
 const i=matches.findIndex(m=>m.id===next.id);
 if(['waiting','playing'].includes(next.status)){if(i>=0)matches[i]=next;else matches.unshift(next);}
 else if(i>=0)matches.splice(i,1);
 render();
}
async function saveNameAndContinue(){
 const value=root.querySelector('#name')?.value.trim();
 if(!value)return;
 sessionStorage.setItem('yatzy.name',value);localStorage.setItem('yatzy.avatar',String(selectedAvatar));
 if(inviteCode){
  busy=true;message='Ansluter till rummet …';render();
  try{
   apply(await command('join',token,null,{name:value,code:inviteCode,avatar:selectedAvatar}));
   history.replaceState({},'',import.meta.env.BASE_URL);
   await watch();
  }catch(e){message=e.message;busy=false;render();return;}
  busy=false;render();
  return;
 }
 await refreshMatches();
 render();
}
function inviteUrl(code){const url=new URL(import.meta.env.BASE_URL,location.origin);url.searchParams.set('room',code);return url.toString();}
async function shareRoom(){
 if(!room||room.mode!=='private')return;
 const url=inviteUrl(room.code);
 const data={title:'Yatzyduell',text:'Häng med på en duell!',url};
 try{
  if(navigator.share){await navigator.share(data);inviteSent=true;message='Inbjudan skickad.';}
  else{await navigator.clipboard.writeText(url);inviteSent=true;message='Inbjudan kopierad.';}
 }catch(e){
  if(e?.name!=='AbortError'){
   try{await navigator.clipboard.writeText(url);inviteSent=true;message='Inbjudan kopierad.';}
   catch{message=url;}
  }
 }
 render();
}
async function createCodeRoom(){
 codeRoom=true;inviteSent=false;
 const name=playerName()||'Spelare';
 busy=true;message='Skapar kod …';render();
 try{
  apply(await command('create',token,null,{name,avatar:selectedAvatar}));
  await watch();
  message='';
 }catch(e){codeRoom=false;message=e.message;}
 finally{busy=false;render();}
}
async function createAndShare(){
 codeRoom=false;inviteSent=false;
 const name=playerName()||'Spelare';
 busy=true;message='Skapar en privat duell …';render();
 try{
  apply(await command('create',token,null,{name,avatar:selectedAvatar}));
  await watch();
  busy=false;render();
  await shareRoom();
 }catch(e){message=e.message;busy=false;render();}
}
async function enter(action){
 const name=playerName()||'Spelare',code=root.querySelector('#code')?.value.toUpperCase();
 busy=true;message='';render();
 try{codeRoom=false;apply(await command(action,token,null,{name,code,avatar:selectedAvatar}));if(action==='join'&&inviteCode){history.replaceState({},'',import.meta.env.BASE_URL);}await watch();}catch(e){message=e.message;}finally{busy=false;render();}
}
async function act(action,payload={}){
 if(busy)return;
 const rerolled=action==='roll'&&room?room.held.map((held,i)=>held?null:i).filter(i=>i!==null):[];
 busy=true;message='';render();
 try{
  const next=await command(action,token,room.id,{...payload,version:room.version});
  if(action==='roll'){
   rerolled.forEach(i=>{diceLanding[i]=randomLanding(i);});
   rollingIndices=rerolled;
   clearTimeout(rollAnimationTimer);
   rollAnimationTimer=setTimeout(()=>{rollingIndices=[];render();},1650);
  }
  apply(next);
  if(action==='leave'){cleanup();room=null;codeRoom=false;localStorage.removeItem('yatzy.room');await refreshMatches();}
 }
 catch(e){rollingIndices=[];message=e.message;await refresh();}finally{busy=false;render();}
}
async function refresh(){
 if(!room||refreshBusy)return;const id=room.id;refreshBusy=true;
 try{const state=await command('get',token,id);if(room?.id===id){connection=local?'Lokal duell':'Ansluten';apply(state);}}
 catch(e){connection='Anslutningen bröts – försöker igen';if(/finns inte|gått ut|spelarnyckel/.test(e.message)){cleanup();room=null;localStorage.removeItem('yatzy.room');message=e.message;}render();}
 finally{refreshBusy=false;}
}
function cleanup(){unsubscribe();clearInterval(timer);}
async function refreshMatches(){
 if(!configured||!token||!playerName()||matchesLoading)return;
 matchesLoading=true;
 try{matches=await command('list',token,null);message=message==='Kunde inte hämta dina matcher.'?'':message;}
 catch{if(!room)message='Kunde inte hämta dina matcher.';}
 finally{matchesLoading=false;if(!room)render();}
}
async function openMatch(id){
 if(busy)return;
 busy=true;message='';
 try{
  cleanup();
  const state=await command('get',token,id);
  room=state;codeRoom=state.status==='waiting'&&state.mode==='private';localStorage.setItem('yatzy.room',id);
  await watch();
 }catch(e){message=e.message;room=null;await refreshMatches();}
 finally{busy=false;render();}
}
async function endMatchAndLobby(){
 if(busy)return;
 if(room?.status==='playing'&&!confirm('Avsluta matchen? Motståndaren vinner den pågående matchen.'))return;
 busy=true;message='';render();
 try{
  if(room&&['waiting','playing'].includes(room.status)){
   await command('leave',token,room.id,{version:room.version});
  }
 }catch(e){
  console.warn('Kunde inte lämna matchen på servern:',e);
 }
 cleanup();
 room=null;codeRoom=false;inviteSent=false;friends=false;subview=null;rollingIndices=[];
 localStorage.removeItem('yatzy.room');
 history.replaceState({},'',import.meta.env.BASE_URL);
 busy=false;
 await refreshMatches();
 render();
}
async function enterApp(){
 if(busy)return;
 started=true;
 message='';
 render();

 // Within the same browser/app session, keep the chosen name/profile and resume
 // an active duel only after the player has pressed Start.
 const saved=localStorage.getItem('yatzy.room');
 if(!configured||!token)return;

 if(inviteCode&&playerName()){
  busy=true;message='Ansluter till rummet …';render();
  try{
   apply(await command('join',token,null,{name:playerName(),code:inviteCode,avatar:selectedAvatar}));
   history.replaceState({},'',import.meta.env.BASE_URL);
   await watch();
   message='';
  }catch(e){
   message=e.message;
   await refreshMatches();
  }finally{
   busy=false;
   render();
  }
  return;
 }

 if(saved&&playerName()){
  busy=true;message='Återansluter till din duell …';render();
  try{
   room=await command('get',token,saved);
   message='';
   await watch();
  }catch{
   room=null;
   localStorage.removeItem('yatzy.room');
   message='';
   await refreshMatches();
  }finally{
   busy=false;
   render();
  }
  return;
 }

 if(playerName())await refreshMatches();
}
async function closeRoom(){
 cleanup();room=null;codeRoom=false;inviteSent=false;rollingIndices=[];localStorage.removeItem('yatzy.room');message='';
 await refreshMatches();render();
}
async function watch(){cleanup();unsubscribe=await subscribe(room.id,token,refresh,status=>{connection=status;render();});timer=setInterval(refresh,local?700:5000);await refresh();}
window.addEventListener('online',()=>{if(room)refresh();else refreshMatches();});document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(room)refresh();else refreshMatches();}});matchesTimer=setInterval(()=>{if(!room&&started&&playerName())refreshMatches();},30000);
render();
