import {BIKES,clamp} from './simulation.js';
export const UPGRADES={engine:{name:'Motore',detail:'+4% potenza per livello',cost:[2200,4800,8500]},brakes:{name:'Freni',detail:'+5% forza frenante per livello',cost:[1800,3900,6900]},tires:{name:'Pneumatici',detail:'+2,5% aderenza per livello',cost:[2000,4300,7600]},suspension:{name:'Sospensioni',detail:'+4% agilità per livello',cost:[1700,3700,6600]},aero:{name:'Aerodinamica',detail:'Meno resistenza e più allungo',cost:[2100,4500,8000]}};
export const LIVERIES=[{id:'factory',name:'Factory'},{id:'heritage',name:'Heritage'},{id:'stealth',name:'Stealth'}];
export function normalizeProfile(raw={}){
 if(!raw||typeof raw!=='object')raw={};
 const owned=Array.isArray(raw.owned)?raw.owned.filter(id=>BIKES.some(b=>b.id===id)):[];
 const base={version:1,credits:12000,owned:BIKES.filter(b=>!b.price).map(b=>b.id),upgrades:{},liveries:{},paid:[],stats:{races:0,wins:0,earned:0},name:'JACK'};
 base.credits=Number.isFinite(raw.credits)?clamp(Math.floor(raw.credits),0,1e9):12000;base.owned=[...new Set([...base.owned,...owned])];
 for(const b of BIKES){base.upgrades[b.id]={};for(const k of Object.keys(UPGRADES))base.upgrades[b.id][k]=clamp(Math.floor(Number(raw.upgrades?.[b.id]?.[k])||0),0,3);base.liveries[b.id]=LIVERIES.some(l=>l.id===raw.liveries?.[b.id])?raw.liveries[b.id]:'factory';}
 base.paid=Array.isArray(raw.paid)?raw.paid.filter(x=>typeof x==='string').slice(-150):[];
 for(const key of Object.keys(base.stats))base.stats[key]=clamp(Math.floor(Number(raw.stats?.[key])||0),0,1e9);
 base.name=String(raw.name||'JACK').replace(/[^a-zA-Z0-9À-ž _.-]/g,'').trim().slice(0,16)||'JACK';return base;
}
export class Career{
 constructor(raw={},save=()=>{}){this.profile=normalizeProfile(raw);this.save=save;}
 commit(){this.save(this.profile);}
 owns(id){return this.profile.owned.includes(id);}
 buy(id){const b=BIKES.find(b=>b.id===id);if(!b)return{ok:false,message:'Moto non disponibile.'};if(this.owns(id))return{ok:false,message:'Moto già nel tuo garage.'};if(this.profile.credits<b.price)return{ok:false,message:'Crediti insufficienti.'};this.profile.credits-=b.price;this.profile.owned.push(id);this.commit();return{ok:true,message:`${b.name} aggiunta al garage.`};}
 upgrade(id,key){const spec=UPGRADES[key],level=this.profile.upgrades[id]?.[key];if(!spec||level===undefined||!this.owns(id))return{ok:false,message:'Acquista prima la moto.'};if(level>=3)return{ok:false,message:'Livello massimo raggiunto.'};const price=spec.cost[level];if(this.profile.credits<price)return{ok:false,message:'Crediti insufficienti.'};this.profile.credits-=price;this.profile.upgrades[id][key]++;this.commit();return{ok:true,message:`${spec.name}: livello ${level+1}.`};}
 bike(id,{stock=false}={}){const base=BIKES.find(b=>b.id===id)||BIKES[0];if(stock)return{...base};const u=this.profile.upgrades[base.id];return{...base,power:Math.round(base.power*(1+u.engine*.04)),top:Math.round(base.top*(1+u.engine*.006+u.aero*.004)),grip:base.grip*(1+u.tires*.025),handling:(base.handling??1)*(1+u.suspension*.04),braking:1+u.brakes*.05,mass:(base.mass??230)-u.suspension*.7,aeroDrag:(base.aeroDrag??.001)*Math.pow(.975,u.aero)};}
 livery(id,value){if(!LIVERIES.some(l=>l.id===value)||!this.owns(id))return false;this.profile.liveries[id]=value;this.commit();return true;}
 reward({id,position=8,laps=2,mode='race',time=0,clean=false,finished=false}){if(!finished||!id||this.profile.paid.includes(id)||time<25)return 0;const prize=mode==='time'?1000:[4600,3600,2900,2400,2100,1800,1500,1300][clamp(position-1,0,7)];const amount=prize+clamp(laps,1,5)*450+(clean?650:0);this.profile.credits+=amount;this.profile.stats.races++;this.profile.stats.wins+=position===1&&mode!=='time'?1:0;this.profile.stats.earned+=amount;this.profile.paid.push(id);this.profile.paid=this.profile.paid.slice(-150);this.commit();return amount;}
 import(raw){this.profile=normalizeProfile(raw);this.commit();}
}
