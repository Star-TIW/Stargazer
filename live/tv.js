(() => {
  "use strict";
  const tvButton=document.getElementById("sg-tv-tab");
  const section=document.getElementById("sg-tv");
  const sports=document.querySelector("div.live-scroll-container");
  const list=document.getElementById("sg-tv-live-list");
  const header=document.getElementById("sg-tv-live-toggle");
  if(!tvButton||!section||!sports||!list||!header)return;
  const commonNames=[
    "abc","cbs","nbc","fox","espn","espn2","cnn","foxnews","pbs","cw",
    "msnbc","cnbc","tnt","tbs","hbo","disneychannel","nickelodeon","cartoonnetwork","foxsports1","foxsports2","cbssportsnetwork","nflnetwork","nbatv","mlbnetwork","usanetwork","fx","fxx","amc",
    "ae","history","discoverychannel","nationalgeographic","animalplanet",
    "foodnetwork","hgtv","tlc","disneyjunior","disneyxd",
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
  // TimStreams exposes non-event listings alongside the sports-event schedule.
  // Include them only when they are explicitly channel-style entries and have
  // public non-VIP iframe URLs on the same validated host used by its game feeds.
  // /api/channels uses {channels:[{url,name,logo,genre,flag,vip,streams}]}.
  const timChannelsFrom=data=>{
    if(!Array.isArray(data?.channels))throw Error("Invalid TimStreams channel catalog");
    const byName=new Map();
    for(const row of data.channels){
      if(!row||row.vip||typeof row.name!=="string"||!Array.isArray(row.streams))continue;
      const name=row.name.trim();
      if(!name)continue;
      const sources=[];
      for(const stream of row.streams){
        if(!stream?.url||stream.vip)continue;
        try{
          const url=new URL(stream.url);
          if(url.origin!=="https://shoewiki.click"||url.username||url.password||url.pathname==="/")continue;
          sources.push({url:url.href,name:"TimStreams"+(stream.name&&stream.name!=="TimStreams"?" · "+stream.name:"")});
        }catch{}
      }
      if(!sources.length)continue;
      const key=normalize(name);
      const logo=typeof row.logo==="string"&&/^https:\/\//.test(row.logo)?row.logo.replace(/&amp;/g,"&"):null;
      const previous=byName.get(key);
      if(previous){
        previous.sources.push(...sources);
        if(!previous.poster)previous.poster=logo;
      }else byName.set(key,{name,poster:logo,sources});
    }
    return [...byName.values()];
  };
  const mergeChannels=(damitv,tim)=>{
    const byName=new Map();
    for(const channel of [...damitv,...tim]){
      const key=normalize(channel.name);
      const previous=byName.get(key);
      if(previous){
        previous.sources=[...new Map([...previous.sources,...channel.sources].map(s=>[s.url,s])).values()];
        if(!previous.poster)previous.poster=channel.poster;
      }else byName.set(key,{...channel});
    }
    return [...byName.values()].sort((a,b)=>rank(a.name)-rank(b.name)||a.name.localeCompare(b.name));
  };
  let loading=null,loadedAt=0,channels=[];
  const openPlayer=channel=>{
    if(typeof window.StargazerLiveOpenPlayer!=="function"){
      console.warn("Stargazer Live player not initialized");
      return;
    }
    window.StargazerLiveOpenPlayer(channel.sources, channel.name);
  };
  const closePlayer=()=>{ window.StargazerLiveClosePlayer?.(); };
  function status(message){
    list.replaceChildren();
    const card=document.createElement("div");
    card.className="game-card";
    card.textContent=message;
    list.append(card);
  }
  function render(){
    list.replaceChildren();
    window.dispatchEvent(new CustomEvent("stargazer:tv-channels",{detail:{channels}}));
    if(!channels.length){status("No TV channels are currently listed.");return}
    for(const channel of channels){
      const card=document.createElement("div");
      card.className="game-card";
      card.classList.add("sg-tv-card");
      const artwork=document.createElement("div");
      artwork.className="sg-tv-artwork";
      artwork.setAttribute("aria-hidden","true");
      // SVG artwork fallback is local, so cards remain branded when a remote logo fails.
      const fallbackSvg=`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="350" viewBox="0 0 600 350"><rect width="600" height="350" fill="#292516"/><text x="300" y="190" text-anchor="middle" font-family="Arial,sans-serif" font-size="110" font-weight="bold" fill="#d7ba66">${channel.name.replace(/[&<>"]/g,"").slice(0,10)}</text></svg>`;
      artwork.style.backgroundImage="url("+JSON.stringify("data:image/svg+xml;charset=utf-8,"+encodeURIComponent(fallbackSvg))+")";
      if(channel.poster){
        const img=new Image();
        img.referrerPolicy="no-referrer";
        img.onload=()=>{
          artwork.style.backgroundImage="url("+JSON.stringify(channel.poster)+")";
          artwork.classList.add("has-image");
        };
        img.onerror=()=>{};
        img.src=channel.poster;
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
      card.append(artwork,title,state,sources,watch);
      list.append(card);
    }
  }
  async function refresh(){
    if(loading)return loading;
    loading=(async()=>{
      if(!channels.length)status("Loading live TV channels...");
      try{
        const [damiResult,timResult]=await Promise.allSettled([
          fetch("https://ondemand.st/papi/api/streams",{credentials:"omit",signal:AbortSignal.timeout(9000),cache:"no-store"})
            .then(async response=>{if(!response.ok)throw Error("DAMITV unavailable");return channelsFrom(await response.json());}),
          fetch("https://tim-streams.com/api/channels",{credentials:"omit",signal:AbortSignal.timeout(9000),cache:"no-store"})
            .then(async response=>{if(!response.ok)throw Error("TimStreams channels unavailable");return timChannelsFrom(await response.json());})
        ]);
        if(damiResult.status==="rejected"&&timResult.status==="rejected")throw Error("No TV providers reachable");
        channels=mergeChannels(
          damiResult.status==="fulfilled"?damiResult.value:[],
          timResult.status==="fulfilled"?timResult.value:[]
        );
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
    try{localStorage.setItem("selectedSport",value?"tv":(document.querySelector(".sport-btn[data-sport].active")?.dataset.sport||"nfl"))}catch{}
    if(value){
      document.querySelectorAll(".sport-btn[data-sport]").forEach(button=>{
        button.classList.remove("active");
        button.setAttribute("aria-pressed","false");
      });
      if(Date.now()-loadedAt>60000)refresh();
    }else closePlayer();
  };
  window.addEventListener("stargazer:tv-reload",()=>{loadedAt=0;refresh()});
  tvButton.onclick=()=>switchTV(section.hidden);
  try{if(localStorage.getItem("selectedSport")==="tv")switchTV(true)}catch{}
  document.querySelectorAll(".sport-btn[data-sport]").forEach(button=>{
    button.addEventListener("click",()=>switchTV(false));
  });
  // The original sports handler controls this header's animation and collapse.
  header.onkeydown=event=>{
    if(event.key==="Enter"||event.key===" "){
      event.preventDefault();
      header.click();
    }
  };
})();
