(() => {
  "use strict";
  const tvButton=document.getElementById("sg-tv-tab");
  const section=document.getElementById("sg-tv");
  const sports=document.querySelector("div.live-scroll-container");
  const list=document.getElementById("sg-tv-live-list");
  const header=document.getElementById("sg-tv-live-toggle");
  if(!tvButton||!section||!sports||!list||!header)return;
  const commonNames=[
    "abc","cbs","nbc","fox","pbs","cw","espn","espn2","cnn","foxnews",
    "msnbc","cnbc","tnt","tbs","usanetwork","fx","fxx","amc",
    "a&e","history","discovery","nationalgeographic","animalplanet",
    "foodnetwork","hgtv","tlc","cartoonnetwork","nickelodeon","disneychannel",
    "comedycentral","mtv","bet","bravo","e","lifetimetv","lifetime",
    "hallmark","nflnetwork","nbatv","mlbnetwork","foxsports1",
    "fs1","fs2","espnu","accnetwork","bigtennetwork","secnetwork"
  ];
  const rank=name=>{
    const normalized=String(name||"").toLowerCase().replace(/[^a-z0-9]/g,"");
    const exact=commonNames.indexOf(normalized);
    if(exact>=0)return exact;
    // Prefer a recognizable channel's regional/HD variant over unrelated listings.
    const prefix=commonNames.findIndex(key=>key.length>=3&&normalized.startsWith(key)&&/^(?:hd|us|usa|east|west|live|24|plus|[0-9])/.test(normalized.slice(key.length)));
    return prefix>=0?prefix+0.5:999;
  };
  const uniqueSources=entries=>{
    const result=new Map();
    for(const entry of entries||[]){
      for(const variant of [{embed:entry.embed,name:"DAMITV"},...(Array.isArray(entry.sources)?entry.sources:[])]){
        try{
          const url=new URL(variant.embed);
          if(!["https://damitv.st","https://ondemand.st"].includes(url.origin)||
             url.username||url.password||!/^\/(?:embed|player\/[^/]+)\/?$/.test(url.pathname))continue;
          result.set(url.href,{url:url.href,name:variant.name?"DAMITV · "+variant.name:"DAMITV"});
        }catch{}
      }
    }
    return [...result.values()];
  };
  const normalize=s=>String(s||"").trim().toLowerCase().replace(/\s+/g," ");
  const channelsFrom=data=>{
    if(data?.success!==true||!Array.isArray(data.streams))throw Error("Invalid channel catalog");
    const grouped=new Map();
    for(const group of data.streams){
      if(!Array.isArray(group?.streams))continue;
      for(const entry of group.streams){
        if(!entry||typeof entry.name!=="string"||!entry.name.trim())continue;
        // This page is for ongoing TV channels, not live sports events.
        if(Number(entry.always_live)!==1)continue;
        if(entry.status&&entry.status!=="live")continue;
        const name=entry.name.trim();
        const key=normalize(name);
        const bucket=grouped.get(key)||{name,entries:[],poster:null};
        bucket.entries.push(entry);
        if(!bucket.poster&&typeof entry.poster==="string"&&/^https:\/\//.test(entry.poster))bucket.poster=entry.poster;
        grouped.set(key,bucket);
      }
    }
    return [...grouped.values()].map(c=>({...c,sources:uniqueSources(c.entries)}))
      .filter(c=>c.sources.length)
      .sort((a,b)=>rank(a.name)-rank(b.name)||a.name.localeCompare(b.name));
  };
  let loading=null,loadedAt=0,channels=[];
  const openPlayer=channel=>{
    if(typeof window.StargazerLiveOpenPlayer!=="function"){
      console.warn("Stargazer Live player not initialized");
      return;
    }
    window.StargazerLiveOpenPlayer(channel.sources);
  };
  const closePlayer=()=>{
    // The normal sports player owns its overlay and close controls.
    // Do not create a second iframe, which can cause audio overlap.
  };
  function status(message){
    list.replaceChildren();
    const card=document.createElement("div");
    card.className="game-card";
    card.textContent=message;
    list.append(card);
  }
  function render(){
    list.replaceChildren();
    if(!channels.length){status("No TV channels are currently listed.");return}
    for(const channel of channels){
      const card=document.createElement("div");
      card.className="game-card";
      const image=document.createElement("div");
      if(channel.poster){
        const img=document.createElement("img");
        img.src=channel.poster;img.alt="";img.loading="lazy";img.className="sg-tv-channel-art";
        image.append(img);
      }
      const title=document.createElement("div");
      title.className="sg-tv-channel-name";
      title.textContent=channel.name;
      const state=document.createElement("div");
      state.className="sg-tv-status";
      state.textContent="Status: Live";
      const sources=document.createElement("div");
      sources.className="sg-tv-source-count";
      sources.textContent=channel.sources.length+" available source"+(channel.sources.length===1?"":"s");
      const watch=document.createElement("button");
      watch.type="button";watch.className="watch-btn";watch.textContent="Watch Live";
      watch.onclick=()=>openPlayer(channel);
      card.append(image,title,state,sources,watch);
      list.append(card);
    }
  }
  async function refresh(){
    if(loading)return loading;
    loading=(async()=>{
      if(!channels.length)status("Loading live TV channels...");
      try{
        const response=await fetch("https://ondemand.st/papi/api/streams",{
          credentials:"omit",signal:AbortSignal.timeout(9000),cache:"no-store"
        });
        if(!response.ok)throw Error("TV listing unavailable");
        const data=await response.json();
        channels=channelsFrom(data);
        loadedAt=Date.now();
        render();
      }catch(error){
        if(!channels.length)status("Could not load TV channels. Switch tabs to try again.");
        console.warn("Live TV listing unavailable:",error);
      }
    })();
    try{await loading}finally{loading=null}
  }
  const switchTV=value=>{
    section.hidden=!value;
    sports.hidden=value;
    tvButton.classList.toggle("active",value);
    tvButton.setAttribute("aria-pressed",String(value));
    if(value){
      document.querySelectorAll(".sport-btn[data-sport]").forEach(button=>{
        button.classList.remove("active");
        button.setAttribute("aria-pressed","false");
      });
      if(Date.now()-loadedAt>60000)refresh();
    }else closePlayer();
  };
  tvButton.onclick=()=>switchTV(section.hidden);
  document.querySelectorAll(".sport-btn[data-sport]").forEach(button=>{
    button.addEventListener("click",()=>switchTV(false));
  });
  const collapse=()=>{
    const expanded=header.getAttribute("aria-expanded")!=="true";
    header.setAttribute("aria-expanded",String(expanded));
    list.hidden=!expanded;
    header.querySelector(".arrow").textContent=expanded?"▼":"▲";
  };
  header.onclick=collapse;
  header.onkeydown=e=>{
    if(e.key==="Enter"||e.key===" "){e.preventDefault();collapse()}
  };
  
})();
