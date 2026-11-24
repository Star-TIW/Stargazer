// Two independent audio elements, preloading the next recording at time zero.
class CrossfadePlayer {
  constructor({track, start, next, seconds, level, muted, state, advance, error, audio = () => new Audio()}) {
    Object.assign(this,{track,next,seconds,level,muted,state,advance,error,audio});
    this.active=this.make(track);
    this.blend=0;
    this.active.currentTime=start;
    this.bind();
  }
  make(track) {
    const el=this.audio();
    el.preload='auto'; el.volume=0; el.muted=this.muted;
    el.src='https://api.audius.co/v1/tracks/'+encodeURIComponent(track.audioId)+'/stream?app_name=Stargazer';
    return el;
  }
  bind() {
    const el=this.active;
    el.onplaying=()=>this.state(1);
    el.onpause=()=>{if(!el.ended)this.state(2);};
    el.onerror=()=>this.error();
    el.onended=()=>{
      if(this.incoming && this.started && !this.incoming.paused) this.promote();
      else this.state(0);
    };
    this.gains();
  }
  gains() {
    this.active.volume=this.level*(1-this.blend);this.active.muted=this.muted;
    if(this.incoming){this.incoming.volume=this.level*this.blend;this.incoming.muted=this.muted;}
  }
  release(el) {
    if(!el)return;
    el.onended=el.onpause=el.onplaying=el.onerror=null;
    el.pause();el.removeAttribute('src');el.load();
  }
  clearNext() {
    this.release(this.incoming);this.incoming=null;this.nextId=null;this.started=false;this.blend=0;
    this.gains();
  }
  tick() {
    const next=this.next(), length=this.seconds(), duration=this.active.duration;
    if(!next?.audioId || !length || !Number.isFinite(duration)) {
      if(this.incoming)this.clearNext();return;
    }
    if(this.nextId!==next.id){
      this.clearNext();this.incoming=this.make(next);this.nextId=next.id;
    }
    if(this.active.paused || this.active.ended)return;
    const remaining=duration-this.active.currentTime;
    const span=Math.min(length,duration,Number.isFinite(this.incoming.duration)?this.incoming.duration:length);
    if(remaining>span || span<=0)return;
    if(!this.started){
      if(this.incoming.readyState<2)return;
      this.started=true;
      const el=this.incoming;
      el.play().catch(()=>{if(el===this.incoming)this.started=false;});
    }
    if(this.incoming.paused || this.incoming.readyState<2)return;
    this.blend=Math.max(0,Math.min(1,1-remaining/span));this.gains();
  }
  promote() {
    const completed=this.active, track=this.next();
    if(!track || track.id!==this.nextId){this.state(0);return;}
    this.active=this.incoming;this.incoming=null;this.started=false;this.blend=0;this.nextId=null;
    this.release(completed);this.track=track;this.bind();this.advance(track);this.state(1);
  }
  getCurrentTime(){return this.active.currentTime;}
  getDuration(){return this.active.duration;}
  getVideoData(){return {video_id:this.track.id};}
  getPlayerState(){return this.active.paused?2:1;}
  setVolume(level){this.level=level/100;this.gains();}
  mute(){this.muted=true;this.gains();}
  unMute(){this.muted=false;this.gains();}
  playVideo(){
    const el=this.active;
    el.play().catch(()=>{if(!this.dead && this.active===el)this.error();});
    if(this.started && this.incoming)this.incoming.play().catch(()=>this.clearNext());
  }
  pauseVideo(){this.active.pause();this.incoming?.pause();}
  seekTo(time){this.clearNext();this.active.currentTime=time;}
  destroy(){this.dead=true;this.release(this.active);this.release(this.incoming);}
}
if(typeof module!=='undefined') module.exports=CrossfadePlayer;
