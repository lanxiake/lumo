/**
 * builtinGames — 内置精品离线小游戏库
 *
 * 4 个自包含、可惊艳孩子的 HTML 小游戏，供"我的游戏 → 推荐游戏"直接开玩，
 * 也作为 Agent 推荐/生成/改造的高质量模板。每个 HTML 必须通过
 * checkPlaygroundHtmlSafety：
 *  - 不含外部资源（无 http/https、无协议相对 //xxx）
 *  - 不含 fetch / XMLHttpRequest / WebSocket / eval / new Function
 *  - 定时器只传函数引用，不传字符串
 *  - JS 注释一律用块注释，禁止行注释 //（会被协议相对 URL 规则误判）
 *
 * 这里只放 body 内的裸 HTML，外层 CSP/沙箱由 wrapPlaygroundHtml 包装。
 * 视觉手段：Canvas 2D 粒子、requestAnimationFrame 动画、WebAudio 合成音效、
 * CSS 渐变/发光，纯前端零依赖即可做出精致效果。
 */

export interface BuiltinGame {
  readonly id: string;
  readonly title: string;
  readonly category: "game" | "effect" | "interactive";
  /** 适龄区间 [最小, 最大] */
  readonly ageRange: readonly [number, number];
  readonly icon: string;
  /** 裸 HTML（body 内容 + 内联 style/script） */
  readonly html: string;
}

/* 烟花秀：点屏放礼花，多级爆炸 + 拖尾 + 重力 + 闪烁 + 音效，深空星空背景 */
const fireworksGame = `
<style>
  html,body{margin:0;height:100%;background:radial-gradient(ellipse at bottom,#1b2735 0%,#090a0f 100%);overflow:hidden;}
  #tip{position:fixed;top:14px;width:100%;text-align:center;color:#ffe;font-family:sans-serif;font-size:18px;text-shadow:0 0 8px #48f;pointer-events:none;animation:blink 2s infinite;}
  @keyframes blink{0%,100%{opacity:.9}50%{opacity:.4}}
  canvas{display:block;}
</style>
<div id="tip">点一点天空，放一朵大烟花！</div>
<canvas id="cv"></canvas>
<script>
(function(){
  var cv=document.getElementById('cv'),ctx=cv.getContext('2d');
  function fit(){cv.width=innerWidth;cv.height=innerHeight;}fit();addEventListener('resize',fit);
  /* 背景小星星 */
  var stars=[];for(var i=0;i<80;i++){stars.push({x:Math.random(),y:Math.random()*0.7,r:Math.random()*1.5+0.3,t:Math.random()*6});}
  var AC=window.AudioContext||window.webkitAudioContext,ac=AC?new AC():null;
  function boomSound(){if(!ac)return;var o=ac.createOscillator(),g=ac.createGain();o.type='triangle';o.frequency.setValueAtTime(180,ac.currentTime);o.frequency.exponentialRampToValueAtTime(40,ac.currentTime+0.4);g.gain.setValueAtTime(0.3,ac.currentTime);g.gain.exponentialRampToValueAtTime(0.001,ac.currentTime+0.5);o.connect(g);g.connect(ac.destination);o.start();o.stop(ac.currentTime+0.5);}
  var rockets=[],sparks=[];
  function launch(tx,ty){
    rockets.push({x:tx,y:cv.height,tx:tx,ty:ty,vy:-(9+Math.random()*3),trail:[]});
  }
  function explode(x,y){
    var hue=Math.floor(Math.random()*360),n=60+Math.floor(Math.random()*40);
    for(var i=0;i<n;i++){var a=Math.PI*2*i/n,sp=Math.random()*5+2;
      sparks.push({x:x,y:y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:1,hue:(hue+Math.random()*40)|0,size:Math.random()*2+1.5});}
    boomSound();
  }
  addEventListener('click',function(e){launch(e.clientX,e.clientY);});
  addEventListener('touchstart',function(e){for(var i=0;i<e.touches.length;i++)launch(e.touches[i].clientX,e.touches[i].clientY);},{passive:true});
  var t0=0;
  function frame(ts){
    var dt=ts-t0;t0=ts;
    ctx.fillStyle='rgba(9,10,15,0.22)';ctx.fillRect(0,0,cv.width,cv.height);
    /* 星星闪烁 */
    for(var s=0;s<stars.length;s++){var st=stars[s];st.t+=0.03;var tw=0.5+0.5*Math.sin(st.t);
      ctx.globalAlpha=tw;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(st.x*cv.width,st.y*cv.height,st.r,0,7);ctx.fill();}
    ctx.globalAlpha=1;
    for(var r=rockets.length-1;r>=0;r--){var rk=rockets[r];rk.y+=rk.vy;rk.vy+=0.12;
      ctx.fillStyle='#ffd98a';ctx.beginPath();ctx.arc(rk.x,rk.y,2.5,0,7);ctx.fill();
      ctx.globalAlpha=0.5;ctx.fillStyle='#ff8';ctx.beginPath();ctx.arc(rk.x,rk.y+6,1.5,0,7);ctx.fill();ctx.globalAlpha=1;
      if(rk.vy>=-1||rk.y<=rk.ty){explode(rk.x,rk.y);rockets.splice(r,1);}}
    for(var i=sparks.length-1;i>=0;i--){var p=sparks[i];p.x+=p.vx;p.y+=p.vy;p.vy+=0.06;p.vx*=0.99;p.life-=0.012;
      if(p.life<=0){sparks.splice(i,1);continue;}
      ctx.globalAlpha=Math.max(0,p.life);
      ctx.fillStyle='hsl('+p.hue+',100%,'+(55+p.life*20)+'%)';
      ctx.shadowBlur=12;ctx.shadowColor=ctx.fillStyle;
      ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,7);ctx.fill();ctx.shadowBlur=0;}
    ctx.globalAlpha=1;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  /* 开场自动放两朵 */
  setTimeout(function(){launch(cv.width*0.3,cv.height*0.3);},400);
  setTimeout(function(){launch(cv.width*0.7,cv.height*0.35);},900);
})();
</script>`;

/* 发光钢琴 + 教学：7 彩琴键自由弹 + 儿歌一键教学（逐音高亮+发声，跟着弹） */
const pianoGame = `
<style>
  html,body{margin:0;height:100%;background:#0d0b1a;font-family:sans-serif;overflow:hidden;}
  #wrap{display:flex;flex-direction:column;height:100%;box-sizing:border-box;}
  #tip{text-align:center;color:#cbd;font-size:15px;padding:8px 4px 4px;min-height:20px;}
  #songs{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;padding:4px 8px 8px;}
  .song{border:none;border-radius:14px;padding:9px 14px;font-size:15px;font-weight:bold;color:#fff;background:linear-gradient(135deg,#6366f1,#b06bff);box-shadow:0 3px 10px rgba(99,102,241,.4);}
  .song:active{transform:scale(.95);}
  .song.playing{background:linear-gradient(135deg,#ff5a7a,#ff9f43);}
  #keys{display:flex;flex:1;gap:4px;padding:6px;box-sizing:border-box;}
  .k{flex:1;border-radius:0 0 18px 18px;display:flex;align-items:flex-end;justify-content:center;padding-bottom:24px;font-size:20px;font-weight:bold;color:rgba(255,255,255,.9);position:relative;overflow:hidden;transition:transform .06s;box-shadow:0 0 20px rgba(0,0,0,.4) inset;}
  .k:active{transform:scale(.97);}
  .k.lit{box-shadow:0 0 44px 8px var(--glow),0 0 20px rgba(0,0,0,.4) inset;transform:scale(1.02);}
</style>
<div id="wrap">
  <div id="tip">跟着彩色琴键弹一弹，或点一首儿歌听我来教你！</div>
  <div id="songs"></div>
  <div id="keys"></div>
</div>
<script>
(function(){
  var notes=[['do',261.6,'#ff5a7a'],['re',293.7,'#ff9f43'],['mi',329.6,'#ffd23f'],['fa',349.2,'#4ade80'],['so',392.0,'#38bdf8'],['la',440.0,'#6366f1'],['xi',493.9,'#b06bff']];
  var idx={do:0,re:1,mi:2,fa:3,so:4,la:5,xi:6};
  /* 儿歌：音名序列 + 每拍时长(毫秒) */
  var songs=[
    {name:'小星星',beat:420,seq:['do','do','so','so','la','la','so','fa','fa','mi','mi','re','re','do']},
    {name:'两只老虎',beat:380,seq:['do','re','mi','do','do','re','mi','do','mi','fa','so','mi','fa','so']},
    {name:'生日快乐',beat:400,seq:['do','do','re','do','fa','mi','do','do','re','do','so','fa']}
  ];
  var AC=window.AudioContext||window.webkitAudioContext,ac=AC?new AC():null;
  function play(f){if(!ac)return;var o=ac.createOscillator(),g=ac.createGain();o.type='sine';o.frequency.value=f;
    var o2=ac.createOscillator(),g2=ac.createGain();o2.type='triangle';o2.frequency.value=f*2;g2.gain.value=0.15;
    g.gain.setValueAtTime(0.0001,ac.currentTime);g.gain.exponentialRampToValueAtTime(0.35,ac.currentTime+0.02);g.gain.exponentialRampToValueAtTime(0.001,ac.currentTime+0.9);
    o.connect(g);g.connect(ac.destination);o2.connect(g2);g2.connect(g);o.start();o2.start();o.stop(ac.currentTime+0.9);o2.stop(ac.currentTime+0.9);}
  function ripple(el,x,y){var d=document.createElement('span');d.style.cssText='position:absolute;left:'+x+'px;top:'+y+'px;width:8px;height:8px;border-radius:50%;background:#fff;transform:translate(-50%,-50%);pointer-events:none;opacity:.9;transition:all .5s;';el.appendChild(d);requestAnimationFrame(function(){d.style.width='160px';d.style.height='160px';d.style.opacity='0';});setTimeout(function(){d.remove();},520);}
  var keyEls=[];
  function lightKey(i){var d=keyEls[i];if(!d)return;d.classList.add('lit');setTimeout(function(){d.classList.remove('lit');},260);}
  var box=document.getElementById('keys');
  notes.forEach(function(n,i){
    var d=document.createElement('div');d.className='k';d.textContent=n[0];
    d.style.background='linear-gradient(180deg,'+n[2]+'cc,'+n[2]+'55)';d.style.setProperty('--glow',n[2]);
    function hit(ev){ev.preventDefault();play(n[1]);lightKey(i);
      var r=d.getBoundingClientRect(),t=ev.touches?ev.touches[0]:ev;ripple(d,(t.clientX-r.left),(t.clientY-r.top));
      if(window.sendToPet)window.sendToPet('note',{note:n[0]});}
    d.addEventListener('mousedown',hit);d.addEventListener('touchstart',hit,{passive:false});
    box.appendChild(d);keyEls.push(d);
  });
  /* 教学播放：逐音符高亮+发声 */
  var playing=null,timers=[];
  function stopSong(){timers.forEach(clearTimeout);timers=[];if(playing){playing.classList.remove('playing');playing=null;}
    document.getElementById('tip').textContent='跟着彩色琴键弹一弹，或点一首儿歌听我来教你！';}
  function teach(song,btn){
    stopSong();playing=btn;btn.classList.add('playing');
    document.getElementById('tip').textContent='正在教你弹《'+song.name+'》，看哪个键在发光就按哪个！';
    if(ac&&ac.state==='suspended')ac.resume();
    song.seq.forEach(function(nm,step){
      var t=setTimeout(function(){var i=idx[nm];play(notes[i][1]);lightKey(i);},step*song.beat);
      timers.push(t);
    });
    var done=setTimeout(function(){stopSong();if(window.sendToPet)window.sendToPet('song_done',{name:song.name});},song.seq.length*song.beat+300);
    timers.push(done);
  }
  var sbox=document.getElementById('songs');
  songs.forEach(function(s){var b=document.createElement('button');b.className='song';b.textContent='🎵 '+s.name;
    b.addEventListener('click',function(){if(playing===b){stopSong();}else{teach(s,b);}});sbox.appendChild(b);});
})();
</script>`;

/* 接数字星星：认数字学习——每颗星带数字，接住即读数并加分；带发光粒子+笑脸篮 */
const catchStarGame = `
<style>
  html,body{margin:0;height:100%;background:linear-gradient(180deg,#2b1055,#7597de);overflow:hidden;font-family:sans-serif;}
  #hud{position:fixed;top:12px;left:0;width:100%;text-align:center;color:#fff;font-size:22px;font-weight:bold;text-shadow:0 2px 6px rgba(0,0,0,.4);pointer-events:none;}
  #big{position:fixed;top:44px;left:0;width:100%;text-align:center;color:#ffe23f;font-size:26px;font-weight:bold;text-shadow:0 2px 8px rgba(0,0,0,.5);pointer-events:none;}
  #tip{position:fixed;bottom:14px;width:100%;text-align:center;color:#eef;font-size:14px;pointer-events:none;opacity:.85;}
  canvas{display:block;}
</style>
<div id="hud">分数 <span id="sc">0</span></div>
<div id="big"></div>
<div id="tip">接住星星，数字越大分数越多！分越高越漂亮，漏接会掉分哦～</div>
<canvas id="cv"></canvas>
<script>
(function(){
  var cv=document.getElementById('cv'),ctx=cv.getContext('2d'),scEl=document.getElementById('sc'),bigEl=document.getElementById('big');
  function fit(){cv.width=innerWidth;cv.height=innerHeight;}fit();addEventListener('resize',fit);
  var basket={x:cv.width/2,w:96,h:56,y:0};
  var items=[],parts=[],rings=[],score=0,spawnT=0,speed=2.2,tgt=cv.width/2,flash=0,flashCol='#fff';
  var CN=['零','一','二','三','四','五','六','七','八','九','十'];
  var AC=window.AudioContext||window.webkitAudioContext,ac=AC?new AC():null;
  function ding(f){if(!ac)return;var o=ac.createOscillator(),g=ac.createGain();o.type='sine';o.frequency.setValueAtTime(f,ac.currentTime);o.frequency.exponentialRampToValueAtTime(f*2,ac.currentTime+0.12);g.gain.setValueAtTime(0.25,ac.currentTime);g.gain.exponentialRampToValueAtTime(0.001,ac.currentTime+0.25);o.connect(g);g.connect(ac.destination);o.start();o.stop(ac.currentTime+0.25);}
  function buzz(){if(!ac)return;var o=ac.createOscillator(),g=ac.createGain();o.type='sawtooth';o.frequency.setValueAtTime(200,ac.currentTime);o.frequency.exponentialRampToValueAtTime(70,ac.currentTime+0.3);g.gain.setValueAtTime(0.18,ac.currentTime);g.gain.exponentialRampToValueAtTime(0.001,ac.currentTime+0.32);o.connect(g);g.connect(ac.destination);o.start();o.stop(ac.currentTime+0.32);}
  function move(x){tgt=x;}
  addEventListener('mousemove',function(e){move(e.clientX);});
  addEventListener('touchmove',function(e){move(e.touches[0].clientX);e.preventDefault();},{passive:false});
  addEventListener('touchstart',function(e){move(e.touches[0].clientX);},{passive:true});
  var palette=['#ffd23f','#ff5a7a','#8ad4ff','#a0e7a0','#ffa8f0'];
  /* 分数分档：0平淡 →3档越来越华丽（背景亮度+粒子+彩环+拖尾） */
  function tier(){if(score>=60)return 3;if(score>=30)return 2;if(score>=12)return 1;return 0;}
  function spawn(){var num=1+Math.floor(Math.random()*10);var col=palette[Math.floor(Math.random()*palette.length)];
    items.push({x:40+Math.random()*(cv.width-80),y:-30,vy:speed+Math.random()*1.0,color:col,rot:0,vr:(Math.random()-0.5)*0.15,num:num});}
  function drawStar(x,y,r,col,rot,num){ctx.save();ctx.translate(x,y);ctx.rotate(rot);ctx.beginPath();for(var i=0;i<5;i++){var a=Math.PI/2*3+i*Math.PI*2/5;ctx.lineTo(Math.cos(a)*r,-Math.sin(a)*r);a+=Math.PI/5;ctx.lineTo(Math.cos(a)*r*0.45,-Math.sin(a)*r*0.45);}ctx.closePath();ctx.fillStyle=col;ctx.shadowBlur=16;ctx.shadowColor=col;ctx.fill();ctx.restore();ctx.shadowBlur=0;
    ctx.fillStyle='#3a2560';ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(num),x,y+1);}
  /* 接住特效：粒子数/尺寸随「数字大小 + 当前档位」放大；高档加彩色冲击环 */
  function catchFx(x,y,col,num){
    var tv=tier();
    var n=8+num*2+tv*6;
    for(var i=0;i<n;i++){var a=Math.PI*2*i/n,sp=(Math.random()*3+1)*(1+num*0.12+tv*0.25);
      parts.push({x:x,y:y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:1,col:(tv>=2&&Math.random()<0.5)?'hsl('+(Math.random()*360|0)+',100%,65%)':col,size:2+num*0.15+tv*0.6});}
    if(tv>=1)rings.push({x:x,y:y,r:8,max:40+num*6+tv*30,col:col,life:1});
    if(tv>=3)rings.push({x:x,y:y,r:4,max:70+num*8,col:'hsl('+(Math.random()*360|0)+',100%,70%)',life:1});
  }
  /* 漏接：掉分 + 平淡灰扑（无彩环、颗粒少而暗） */
  function missFx(x,y){for(var i=0;i<6;i++){var a=Math.PI*2*i/6;parts.push({x:x,y:cv.height-20,vx:Math.cos(a)*1.2,vy:-Math.random()*1.5,life:0.7,col:'#7a7a8a',size:2});}}
  var bigT=0,bigCol='#ffe23f';
  function showBig(txt,col){bigEl.textContent=txt;bigEl.style.color=col;bigT=60;}
  function frame(){
    basket.y=cv.height-90;basket.x+=(tgt-basket.x)*0.2;
    var tv=tier();
    /* 背景：档位越高越亮越梦幻（低分偏暗淡） */
    var topC=['#241041','#2b1055','#3a1570','#4a1a8f'][tv];
    var g=ctx.createLinearGradient(0,0,0,cv.height);g.addColorStop(0,topC);g.addColorStop(1,tv>=2?'#7597de':'#4a5a80');
    ctx.globalAlpha=1;ctx.fillStyle=g;ctx.fillRect(0,0,cv.width,cv.height);
    ctx.fillStyle='rgba(20,10,40,'+(0.28-tv*0.04)+')';ctx.fillRect(0,0,cv.width,cv.height);
    /* 高档背景飘动小星点 */
    if(tv>=2){for(var s=0;s<tv*8;s++){var sx=(s*97+ (Date.now()/40))%cv.width,sy=(s*53)%cv.height;ctx.globalAlpha=0.5;ctx.fillStyle='#fff';ctx.fillRect(sx,sy,2,2);}ctx.globalAlpha=1;}
    spawnT++;if(spawnT>Math.max(34,80-score*0.6)){spawnT=0;spawn();}
    for(var i=items.length-1;i>=0;i--){var it=items[i];it.y+=it.vy;it.rot+=it.vr;
      drawStar(it.x,it.y,18,it.color,it.rot,it.num);
      if(it.y>basket.y-basket.h/2&&it.y<basket.y+basket.h/2&&Math.abs(it.x-basket.x)<basket.w/2){
        score+=it.num;scEl.textContent=score;speed+=0.02;catchFx(it.x,it.y,it.color,it.num);ding(500+it.num*40);
        showBig('+'+it.num+'  '+it.num+'·'+CN[it.num],'#ffe23f');flash=Math.min(0.5,0.12+it.num*0.03);flashCol=it.color;items.splice(i,1);
        if(window.sendToPet)window.sendToPet('catch',{score:score,num:it.num});continue;}
      if(it.y>cv.height+40){
        /* 漏接掉分（不小于0），平淡反馈 */
        var pen=Math.min(3,it.num);score=Math.max(0,score-pen);scEl.textContent=score;
        missFx(it.x,it.y);buzz();showBig('-'+pen,'#9aa');items.splice(i,1);
      }}
    /* 彩色冲击环（高分档才有） */
    for(var ri=rings.length-1;ri>=0;ri--){var rg=rings[ri];rg.r+=(rg.max-rg.r)*0.18;rg.life-=0.05;
      if(rg.life<=0){rings.splice(ri,1);continue;}
      ctx.globalAlpha=rg.life*0.8;ctx.strokeStyle=rg.col;ctx.lineWidth=3;ctx.shadowBlur=14;ctx.shadowColor=rg.col;
      ctx.beginPath();ctx.arc(rg.x,rg.y,rg.r,0,7);ctx.stroke();ctx.shadowBlur=0;}
    ctx.globalAlpha=1;
    for(var p=parts.length-1;p>=0;p--){var pt=parts[p];pt.x+=pt.vx;pt.y+=pt.vy;pt.vy+=0.12;pt.life-=0.03;
      if(pt.life<=0){parts.splice(p,1);continue;}ctx.globalAlpha=pt.life;ctx.fillStyle=pt.col;
      if(tv>=1){ctx.shadowBlur=8;ctx.shadowColor=pt.col;}
      ctx.beginPath();ctx.arc(pt.x,pt.y,pt.size||3,0,7);ctx.fill();ctx.shadowBlur=0;}
    ctx.globalAlpha=1;
    /* 接住瞬间全屏微光（分越高越亮） */
    if(flash>0){ctx.globalAlpha=flash;ctx.fillStyle=flashCol;ctx.fillRect(0,0,cv.width,cv.height);ctx.globalAlpha=1;flash-=0.03;}
    if(bigT>0){bigT--;if(bigT===0)bigEl.textContent='';}
    var bx=basket.x,by=basket.y;
    ctx.fillStyle='#ff9f43';ctx.strokeStyle='#e67e22';ctx.lineWidth=4;
    ctx.beginPath();ctx.moveTo(bx-basket.w/2,by-basket.h/2);ctx.quadraticCurveTo(bx,by+basket.h/2,bx+basket.w/2,by-basket.h/2);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle='#5a3210';ctx.beginPath();ctx.arc(bx-16,by-6,4,0,7);ctx.arc(bx+16,by-6,4,0,7);ctx.fill();
    ctx.strokeStyle='#5a3210';ctx.lineWidth=3;ctx.beginPath();ctx.arc(bx,by+2,12,0.1*Math.PI,0.9*Math.PI);ctx.stroke();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
</script>`;

/* 涂鸦画板 + 描红学画：多彩发光笔 + 简笔画模板(太阳/小猫/房子)照着描/涂色 + 星星贴纸 */
const paintGame = `
<style>
  html,body{margin:0;height:100%;font-family:sans-serif;background:#fffdf8;overflow:hidden;touch-action:none;}
  #bar{position:fixed;top:0;left:0;width:100%;display:flex;align-items:center;gap:8px;padding:8px 10px;box-sizing:border-box;background:rgba(255,255,255,.92);box-shadow:0 2px 8px rgba(0,0,0,.08);z-index:2;overflow-x:auto;}
  .sw{width:34px;height:34px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 4px rgba(0,0,0,.25);flex:0 0 auto;}
  .sw.on{transform:scale(1.18);box-shadow:0 0 0 3px #333;}
  .tool{flex:0 0 auto;border:none;border-radius:12px;padding:8px 11px;font-size:14px;font-weight:bold;color:#fff;background:#888;white-space:nowrap;}
  #clear{background:#ff5a5a;}.tpl{background:#6366f1;}#star{background:#ffb400;}
  canvas{display:block;position:absolute;top:0;left:0;}
  #tip{position:fixed;bottom:12px;width:100%;text-align:center;color:#999;font-size:13px;pointer-events:none;}
</style>
<div id="bar"></div>
<div id="tip">选一个图案，照着灰色线条描一描、涂上颜色吧！</div>
<canvas id="guide"></canvas>
<canvas id="cv"></canvas>
<script>
(function(){
  var guide=document.getElementById('guide'),gx=guide.getContext('2d');
  var cv=document.getElementById('cv'),ctx=cv.getContext('2d');
  function fit(){[guide,cv].forEach(function(c){c.width=innerWidth;c.height=innerHeight;});}fit();addEventListener('resize',fit);
  var color='#ff5a7a',size=10,drawing=false,last=null,mode='draw';
  var palette=['#ff5a7a','#ff9f43','#ffd23f','#4ade80','#38bdf8','#6366f1','#b06bff','#333333'];
  var bar=document.getElementById('bar');
  palette.forEach(function(c,idx){var s=document.createElement('div');s.className='sw'+(idx===0?' on':'');s.style.background=c;
    s.addEventListener('click',function(){color=c;mode='draw';document.querySelectorAll('.sw').forEach(function(e){e.classList.remove('on');});s.classList.add('on');});bar.appendChild(s);});
  /* 简笔画模板：画在 guide 层（浅灰虚线），孩子在 cv 层描红/涂色 */
  function tplStroke(fn){gx.clearRect(0,0,guide.width,guide.height);gx.save();gx.strokeStyle='#c8c8d0';gx.lineWidth=3;gx.setLineDash([8,7]);gx.lineCap='round';gx.lineJoin='round';
    var cx=guide.width/2,cy=guide.height*0.55,s=Math.min(guide.width,guide.height)*0.3;fn(cx,cy,s);gx.restore();}
  var templates={
    sun:function(cx,cy,s){gx.beginPath();gx.arc(cx,cy,s*0.6,0,7);gx.stroke();
      for(var i=0;i<12;i++){var a=i*Math.PI/6;gx.beginPath();gx.moveTo(cx+Math.cos(a)*s*0.75,cy+Math.sin(a)*s*0.75);gx.lineTo(cx+Math.cos(a)*s*1.05,cy+Math.sin(a)*s*1.05);gx.stroke();}},
    cat:function(cx,cy,s){gx.beginPath();gx.arc(cx,cy,s*0.6,0,7);gx.stroke();
      gx.beginPath();gx.moveTo(cx-s*0.5,cy-s*0.4);gx.lineTo(cx-s*0.62,cy-s*0.9);gx.lineTo(cx-s*0.18,cy-s*0.55);gx.stroke();
      gx.beginPath();gx.moveTo(cx+s*0.5,cy-s*0.4);gx.lineTo(cx+s*0.62,cy-s*0.9);gx.lineTo(cx+s*0.18,cy-s*0.55);gx.stroke();
      gx.beginPath();gx.arc(cx-s*0.22,cy-s*0.05,s*0.08,0,7);gx.arc(cx+s*0.22,cy-s*0.05,s*0.08,0,7);gx.stroke();
      gx.beginPath();gx.moveTo(cx,cy+s*0.05);gx.lineTo(cx,cy+s*0.2);gx.stroke();
      gx.beginPath();gx.moveTo(cx-s*0.5,cy+s*0.15);gx.lineTo(cx-s*0.15,cy+s*0.2);gx.moveTo(cx+s*0.5,cy+s*0.15);gx.lineTo(cx+s*0.15,cy+s*0.2);gx.stroke();},
    house:function(cx,cy,s){gx.strokeRect(cx-s*0.6,cy-s*0.2,s*1.2,s*0.9);
      gx.beginPath();gx.moveTo(cx-s*0.72,cy-s*0.2);gx.lineTo(cx,cy-s*0.85);gx.lineTo(cx+s*0.72,cy-s*0.2);gx.stroke();
      gx.strokeRect(cx-s*0.18,cy+s*0.25,s*0.36,s*0.45);
      gx.strokeRect(cx+s*0.25,cy+s*0.0,s*0.25,s*0.25);}
  };
  function addTpl(id,label){var b=document.createElement('button');b.className='tool tpl';b.textContent=label;
    b.addEventListener('click',function(){tplStroke(templates[id]);if(window.sendToPet)window.sendToPet('template',{id:id});});bar.appendChild(b);}
  addTpl('sun','☀ 太阳');addTpl('cat','🐱 小猫');addTpl('house','🏠 房子');
  var star=document.createElement('button');star.id='star';star.className='tool';star.textContent='✦ 星星';star.addEventListener('click',function(){mode='star';});bar.appendChild(star);
  var clr=document.createElement('button');clr.id='clear';clr.className='tool';clr.textContent='清空';clr.addEventListener('click',function(){ctx.clearRect(0,0,cv.width,cv.height);gx.clearRect(0,0,guide.width,guide.height);});bar.appendChild(clr);
  function pos(e){var t=e.touches?e.touches[0]:e;return {x:t.clientX,y:t.clientY};}
  function stamp(x,y){var r=18;ctx.save();ctx.translate(x,y);ctx.beginPath();for(var i=0;i<5;i++){var a=Math.PI/2*3+i*Math.PI*2/5;ctx.lineTo(Math.cos(a)*r,-Math.sin(a)*r);a+=Math.PI/5;ctx.lineTo(Math.cos(a)*r*0.45,-Math.sin(a)*r*0.45);}ctx.closePath();ctx.fillStyle=color;ctx.shadowBlur=14;ctx.shadowColor=color;ctx.fill();ctx.restore();ctx.shadowBlur=0;}
  function start(e){if(pos(e).y<54)return;drawing=true;last=pos(e);if(mode==='star'){stamp(last.x,last.y);drawing=false;}}
  function move(e){if(!drawing)return;var p=pos(e);ctx.strokeStyle=color;ctx.lineWidth=size;ctx.lineCap='round';ctx.lineJoin='round';
    ctx.shadowBlur=8;ctx.shadowColor=color;ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();ctx.shadowBlur=0;last=p;e.preventDefault();}
  function end(){drawing=false;last=null;}
  cv.addEventListener('mousedown',start);cv.addEventListener('mousemove',move);cv.addEventListener('mouseup',end);
  cv.addEventListener('touchstart',start,{passive:true});cv.addEventListener('touchmove',move,{passive:false});cv.addEventListener('touchend',end);
})();
</script>`;

/* 识字拼音：主题分组字库(30+字) + 学习卡(声调分解跟读/描红) + 听音找字闯关 + 过关奖励 */
const literacyGame = `
<style>
  html,body{margin:0;height:100%;font-family:sans-serif;background:linear-gradient(160deg,#fff4e6,#ffe0ec);overflow:hidden;color:#4a4a4a;}
  #app{display:flex;flex-direction:column;align-items:center;height:100%;box-sizing:border-box;padding:12px;}
  #bar{display:flex;align-items:center;justify-content:space-between;width:100%;max-width:460px;margin-bottom:6px;}
  #title{font-size:16px;color:#c76;font-weight:bold;}
  #stars{font-size:15px;color:#f5a623;font-weight:bold;}
  .screen{flex:1;width:100%;max-width:460px;display:none;flex-direction:column;align-items:center;}
  .screen.on{display:flex;}
  /* 主题选择 */
  #themes{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;align-content:center;flex:1;}
  .theme{border:none;border-radius:22px;width:132px;height:112px;background:#fff;box-shadow:0 6px 18px rgba(200,120,150,.22);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;transition:transform .15s;}
  .theme:active{transform:scale(.94);}
  .theme .ti{font-size:46px;line-height:1;}
  .theme .tn{font-size:17px;font-weight:bold;color:#c86;}
  .theme .tp{font-size:12px;color:#a98;}
  .theme.locked{opacity:.55;}
  .lock{font-size:13px;color:#b99;}
  /* 学习卡 */
  #card{flex:1;width:100%;border-radius:28px;background:#fff;box-shadow:0 10px 30px rgba(200,120,150,.25);display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;transition:transform .25s,opacity .25s;margin-bottom:8px;}
  #syl{display:flex;gap:8px;margin-bottom:2px;}
  .syl{font-size:26px;color:#ff9f43;font-weight:bold;padding:2px 8px;border-radius:10px;transition:background .2s,color .2s;}
  .syl.hi{background:#ffe0b0;color:#e8600a;}
  #pinyin{font-size:38px;color:#ff7aa2;font-weight:bold;letter-spacing:2px;}
  #emoji{font-size:84px;line-height:1;margin:2px 0;}
  #hanzi{font-size:104px;font-weight:900;color:#4a3;line-height:1;position:relative;width:200px;height:200px;display:flex;align-items:center;justify-content:center;}
  #stroke{position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;}
  #word{font-size:22px;color:#888;margin-top:6px;}
  #row{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;}
  .nav{border:none;border-radius:18px;padding:12px 18px;font-size:17px;font-weight:bold;color:#fff;background:linear-gradient(135deg,#ff9f43,#ff7aa2);box-shadow:0 4px 12px rgba(255,140,120,.4);}
  .nav:active{transform:scale(.94);}
  .nav.sec{background:linear-gradient(135deg,#9ad,#6cf);}
  .nav.go{background:linear-gradient(135deg,#4ade80,#16a34a);}
  #idx{color:#c98;font-size:13px;margin-top:6px;}
  /* 听音找字闯关 */
  #quizTip{font-size:17px;color:#c76;font-weight:bold;margin:8px 0;text-align:center;}
  #bigSound{border:none;border-radius:50%;width:96px;height:96px;font-size:44px;color:#fff;background:linear-gradient(135deg,#38bdf8,#6366f1);box-shadow:0 6px 16px rgba(80,120,240,.4);margin-bottom:14px;}
  #bigSound:active{transform:scale(.93);}
  #choices{display:flex;flex-wrap:wrap;gap:14px;justify-content:center;}
  .choice{border:none;border-radius:20px;width:96px;height:96px;font-size:52px;font-weight:900;color:#4a3;background:#fff;box-shadow:0 5px 14px rgba(150,120,80,.25);transition:transform .15s;}
  .choice:active{transform:scale(.93);}
  .choice.ok{background:linear-gradient(135deg,#4ade80,#16a34a);color:#fff;}
  .choice.no{background:linear-gradient(135deg,#f87171,#dc2626);color:#fff;}
  #qmsg{font-size:20px;font-weight:bold;min-height:26px;margin-top:12px;}
  #qprog{font-size:13px;color:#c98;margin-top:6px;}
  #back{position:absolute;left:12px;top:10px;border:none;background:rgba(255,255,255,.7);border-radius:14px;padding:6px 12px;font-size:14px;color:#c86;font-weight:bold;}
  /* 过关弹层 */
  #win{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;background:rgba(255,245,235,.94);z-index:5;}
  #win.on{display:flex;}
  #winIcon{font-size:88px;}
  #winTxt{font-size:24px;font-weight:bold;color:#f5a623;margin:8px 0;}
</style>
<div id="app">
  <div id="bar"><span id="title">📖 认字学拼音</span><span id="stars">⭐ 0</span></div>

  <div class="screen on" id="scrThemes"><div id="themes"></div></div>

  <div class="screen" id="scrLearn">
    <button id="back">◀ 主题</button>
    <div id="card">
      <div id="syl"></div><div id="pinyin"></div><div id="emoji"></div>
      <div id="hanzi"><span id="hz"></span><canvas id="stroke" width="200" height="200"></canvas></div><div id="word"></div>
    </div>
    <div id="row">
      <button class="nav" id="prev">◀</button>
      <button class="nav" id="sound">🔊 读一读</button>
      <button class="nav sec" id="trace">✏️ 描红</button>
      <button class="nav" id="next">▶</button>
      <button class="nav go" id="toQuiz">🎯 闯关</button>
    </div>
    <div id="idx"></div>
  </div>

  <div class="screen" id="scrQuiz">
    <button id="back2" style="position:absolute;left:12px;top:10px;border:none;background:rgba(255,255,255,.7);border-radius:14px;padding:6px 12px;font-size:14px;color:#c86;font-weight:bold;">◀ 主题</button>
    <div id="quizTip">听一听，点出听到的字！</div>
    <button id="bigSound">🔊</button>
    <div id="choices"></div>
    <div id="qmsg"></div>
    <div id="qprog"></div>
  </div>

  <div id="win"><div id="winIcon">🎉</div><div id="winTxt"></div>
    <button class="nav go" id="winNext" style="margin-top:6px;">继续 ▶</button>
  </div>
</div>
<script>
(function(){
  /* 主题字库：每主题一组字（h汉字 p拼音带声调 e图 w组词 s拼音音节分解） */
  var THEMES=[
    {id:'animal',name:'小动物',icon:'🐱',cards:[
      {h:'猫',p:'māo',e:'🐱',w:'小猫',s:['m','āo']},{h:'狗',p:'gǒu',e:'🐶',w:'小狗',s:['g','ǒu']},
      {h:'鱼',p:'yú',e:'🐟',w:'金鱼',s:['y','ú']},{h:'鸟',p:'niǎo',e:'🐦',w:'小鸟',s:['n','iǎo']},
      {h:'兔',p:'tù',e:'🐰',w:'兔子',s:['t','ù']},{h:'马',p:'mǎ',e:'🐴',w:'小马',s:['m','ǎ']},
      {h:'羊',p:'yáng',e:'🐑',w:'绵羊',s:['y','áng']},{h:'虫',p:'chóng',e:'🐛',w:'虫子',s:['ch','óng']}
    ]},
    {id:'nature',name:'大自然',icon:'🌳',cards:[
      {h:'日',p:'rì',e:'☀️',w:'太阳',s:['r','ì']},{h:'月',p:'yuè',e:'🌙',w:'月亮',s:['y','uè']},
      {h:'水',p:'shuǐ',e:'💧',w:'喝水',s:['sh','uǐ']},{h:'火',p:'huǒ',e:'🔥',w:'火苗',s:['h','uǒ']},
      {h:'山',p:'shān',e:'⛰️',w:'大山',s:['sh','ān']},{h:'花',p:'huā',e:'🌸',w:'花朵',s:['h','uā']},
      {h:'木',p:'mù',e:'🌳',w:'树木',s:['m','ù']},{h:'星',p:'xīng',e:'⭐',w:'星星',s:['x','īng']},
      {h:'云',p:'yún',e:'☁️',w:'白云',s:['y','ún']},{h:'雨',p:'yǔ',e:'🌧️',w:'下雨',s:['y','ǔ']}
    ]},
    {id:'body',name:'我自己',icon:'🧒',cards:[
      {h:'人',p:'rén',e:'🧒',w:'人们',s:['r','én']},{h:'口',p:'kǒu',e:'👄',w:'开口',s:['k','ǒu']},
      {h:'手',p:'shǒu',e:'✋',w:'小手',s:['sh','ǒu']},{h:'目',p:'mù',e:'👁️',w:'眼睛',s:['m','ù']},
      {h:'耳',p:'ěr',e:'👂',w:'耳朵',s:['','ěr']},{h:'足',p:'zú',e:'🦶',w:'足球',s:['z','ú']},
      {h:'心',p:'xīn',e:'❤️',w:'开心',s:['x','īn']}
    ]},
    {id:'life',name:'生活',icon:'🍎',cards:[
      {h:'米',p:'mǐ',e:'🍚',w:'大米',s:['m','ǐ']},{h:'果',p:'guǒ',e:'🍎',w:'水果',s:['g','uǒ']},
      {h:'车',p:'chē',e:'🚗',w:'汽车',s:['ch','ē']},{h:'门',p:'mén',e:'🚪',w:'开门',s:['m','én']},
      {h:'书',p:'shū',e:'📖',w:'看书',s:['sh','ū']},{h:'家',p:'jiā',e:'🏠',w:'回家',s:['j','iā']},
      {h:'灯',p:'dēng',e:'💡',w:'台灯',s:['d','ēng']}
    ]}
  ];
  var QUIZ_PASS=5; /* 每关答对多少题过关 */
  var stars=0,curTheme=null,ci=0,unlocked={animal:true};
  var quiz={pool:[],cur:null,done:0,right:0};

  var el=function(id){return document.getElementById(id);};
  var starsEl=el('stars');
  var AC=window.AudioContext||window.webkitAudioContext,ac=AC?new AC():null;
  function beep(ok){if(!ac)return;if(ac.state==='suspended')ac.resume();var o=ac.createOscillator(),g=ac.createGain();o.type='sine';var f=ok?660:200;o.frequency.setValueAtTime(f,ac.currentTime);o.frequency.exponentialRampToValueAtTime(ok?990:120,ac.currentTime+0.15);g.gain.setValueAtTime(0.22,ac.currentTime);g.gain.exponentialRampToValueAtTime(0.001,ac.currentTime+0.3);o.connect(g);g.connect(ac.destination);o.start();o.stop(ac.currentTime+0.3);}
  /* 朗读：优先系统 TTS（sendToPet），退化 web speechSynthesis，再退化提示音 */
  function speak(txt){
    if(window.sendToPet){window.sendToPet('speak',{text:txt});return;}
    try{if(window.speechSynthesis){var u=new SpeechSynthesisUtterance(txt);u.lang='zh-CN';u.rate=0.8;window.speechSynthesis.cancel();window.speechSynthesis.speak(u);return;}}catch(_e){}
    beep(true);
  }
  function show(id){var ss=document.querySelectorAll('.screen');for(var k=0;k<ss.length;k++)ss[k].classList.remove('on');el(id).classList.add('on');}
  function setStars(n){stars=n;starsEl.textContent='⭐ '+stars;}

  /* ---- 主题选择 ---- */
  function renderThemes(){
    var box=el('themes');box.innerHTML='';
    THEMES.forEach(function(t){
      var b=document.createElement('button');b.className='theme'+(unlocked[t.id]?'':' locked');
      var lk=unlocked[t.id]?'':'<div class="lock">🔒 需 5⭐</div>';
      b.innerHTML='<div class="ti">'+t.icon+'</div><div class="tn">'+t.name+'</div><div class="tp">'+t.cards.length+' 个字</div>'+lk;
      b.addEventListener('click',function(){
        if(!unlocked[t.id]){if(stars>=5){unlocked[t.id]=true;renderThemes();}else{speak('先得五颗星星才能解锁哦');}return;}
        curTheme=t;ci=0;show('scrLearn');renderCard(false);
      });
      box.appendChild(b);
    });
  }

  /* ---- 学习卡 ---- */
  var strokeCv=el('stroke'),sctx=strokeCv.getContext('2d');
  function renderCard(anim){
    var c=curTheme.cards[ci];
    var sy=el('syl');sy.innerHTML='';
    c.s.forEach(function(part){if(!part)return;var d=document.createElement('span');d.className='syl';d.textContent=part;sy.appendChild(d);});
    el('pinyin').textContent=c.p;el('emoji').textContent=c.e;
    el('hz').textContent=c.h;
    el('word').textContent=c.w;el('idx').textContent=(ci+1)+' / '+curTheme.cards.length;
    sctx.clearRect(0,0,200,200);
    var card=el('card');if(anim){card.style.transform='scale(.9)';card.style.opacity='.4';setTimeout(function(){card.style.transform='scale(1)';card.style.opacity='1';},20);}
  }
  /* 声调跟读：逐音节高亮 + 分段朗读，最后读整字与组词 */
  function sayCard(){
    var c=curTheme.cards[ci];
    var syls=document.querySelectorAll('#syl .syl');
    for(var k=0;k<syls.length;k++)syls[k].classList.remove('hi');
    var seq=c.s.filter(function(x){return x;});
    var step=0;
    function nextStep(){
      if(step<seq.length){for(var k2=0;k2<syls.length;k2++)syls[k2].classList.remove('hi');if(syls[step])syls[step].classList.add('hi');speak(seq[step]);step++;setTimeout(nextStep,650);}
      else{for(var k3=0;k3<syls.length;k3++)syls[k3].classList.remove('hi');speak(c.h+'，'+c.w);}
    }
    nextStep();
  }
  /* 描红：在汉字上画一条示意运笔轨迹（简化：从上到下的引导线，非真实笔顺库） */
  function traceStroke(){
    sctx.clearRect(0,0,200,200);sctx.strokeStyle='rgba(255,150,90,.75)';sctx.lineWidth=8;sctx.lineCap='round';
    var pts=[[60,40],[140,40],[100,40],[100,160],[60,120],[140,120]];var i2=0;
    function seg(){if(i2>=pts.length-1){return;}var a=pts[i2],b=pts[i2+1];var t=0;
      function anim(){t+=0.08;if(t>1)t=1;sctx.beginPath();sctx.moveTo(a[0],a[1]);sctx.lineTo(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t);sctx.stroke();if(t<1)requestAnimationFrame(anim);else{i2++;setTimeout(seg,120);}}
      anim();}
    seg();
  }
  function go(d){ci=(ci+d+curTheme.cards.length)%curTheme.cards.length;renderCard(true);sayCard();}
  el('prev').addEventListener('click',function(){go(-1);});
  el('next').addEventListener('click',function(){go(1);});
  el('sound').addEventListener('click',sayCard);
  el('trace').addEventListener('click',traceStroke);
  el('back').addEventListener('click',function(){show('scrThemes');renderThemes();});
  el('toQuiz').addEventListener('click',startQuiz);

  /* ---- 听音找字闯关 ---- */
  function startQuiz(){quiz.done=0;quiz.right=0;show('scrQuiz');nextQuiz();}
  function nextQuiz(){
    el('qmsg').textContent='';
    var pool=curTheme.cards;
    var target=pool[Math.floor(Math.random()*pool.length)];
    quiz.cur=target;
    var opts=[target];
    while(opts.length<3&&opts.length<pool.length){var c=pool[Math.floor(Math.random()*pool.length)];if(opts.indexOf(c)<0)opts.push(c);}
    opts.sort(function(){return Math.random()-0.5;});
    var box=el('choices');box.innerHTML='';
    opts.forEach(function(c){var b=document.createElement('button');b.className='choice';b.textContent=c.h;
      b.addEventListener('click',function(){pickQuiz(c,b);});box.appendChild(b);});
    el('qprog').textContent='已过 '+quiz.right+' / '+QUIZ_PASS;
    setTimeout(function(){speak(target.h);},250);
  }
  function pickQuiz(c,btn){
    if(c===quiz.cur){btn.classList.add('ok');beep(true);el('qmsg').style.color='#16a34a';el('qmsg').textContent='答对啦！🎉';
      quiz.right++;setStars(stars+1);
      if(quiz.right>=QUIZ_PASS){setTimeout(winLevel,700);}else{setTimeout(nextQuiz,850);}
    }else{btn.classList.add('no');beep(false);el('qmsg').style.color='#dc2626';el('qmsg').textContent='再听一次～';
      speak(quiz.cur.h);setTimeout(function(){btn.classList.remove('no');},500);}
  }
  el('bigSound').addEventListener('click',function(){if(quiz.cur)speak(quiz.cur.h);});
  el('back2').addEventListener('click',function(){show('scrThemes');renderThemes();});

  function winLevel(){
    el('winTxt').textContent='闯关成功！获得 '+QUIZ_PASS+' ⭐';
    el('win').classList.add('on');speak('太棒啦，闯关成功');
    if(window.sendToPet)window.sendToPet('quiz_pass',{theme:curTheme.id,stars:stars});
  }
  el('winNext').addEventListener('click',function(){el('win').classList.remove('on');show('scrThemes');renderThemes();});

  renderThemes();setStars(0);
})();
</script>`;

/* 简单数学：图形化加减法——用可爱图形演示，点选答案；含"数学的用处"生活小情景 */
const mathGame = `
<style>
  html,body{margin:0;height:100%;font-family:sans-serif;background:linear-gradient(160deg,#e6f4ff,#e9fff0);overflow:hidden;}
  #wrap{display:flex;flex-direction:column;align-items:center;height:100%;box-sizing:border-box;padding:14px;}
  #score{color:#3a8;font-size:16px;font-weight:bold;margin-bottom:4px;}
  #scene{color:#789;font-size:14px;text-align:center;min-height:20px;margin-bottom:6px;padding:0 8px;}
  #q{font-size:30px;font-weight:bold;color:#357;margin:4px 0;}
  #shapes{flex:0 0 auto;min-height:120px;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px;max-width:440px;padding:6px;}
  .em{font-size:40px;}
  .plus{font-size:34px;color:#f90;font-weight:bold;margin:0 6px;}
  #opts{display:flex;gap:14px;flex-wrap:wrap;justify-content:center;margin-top:14px;}
  .opt{border:none;border-radius:20px;width:76px;height:76px;font-size:34px;font-weight:bold;color:#fff;background:linear-gradient(135deg,#38bdf8,#6366f1);box-shadow:0 4px 12px rgba(80,120,240,.4);}
  .opt:active{transform:scale(.93);}
  .opt.ok{background:linear-gradient(135deg,#4ade80,#16a34a);}
  .opt.no{background:linear-gradient(135deg,#f87171,#dc2626);}
  #msg{font-size:22px;font-weight:bold;min-height:30px;margin-top:12px;}
</style>
<div id="wrap">
  <div id="score">答对 <span id="sc">0</span> 题</div>
  <div id="scene"></div>
  <div id="q"></div>
  <div id="shapes"></div>
  <div id="opts"></div>
  <div id="msg"></div>
</div>
<script>
(function(){
  var emojis=['🍎','🍓','🐟','⭐','🎈','🍪','🐤','🌸'];
  var scenes=[
    '分苹果啦：算一算一共有几个苹果，就知道够不够小朋友分！',
    '数一数：会算数，买东西时就知道要几个啦！',
    '排队做操：算清楚人数，谁也不会掉队～',
    '分饼干：算一算才能公平地分给每个好朋友哦！'
  ];
  var sc=0,answer=0;
  var qEl=document.getElementById('q'),shEl=document.getElementById('shapes'),optEl=document.getElementById('opts'),msg=document.getElementById('msg'),scEl=document.getElementById('sc'),sceneEl=document.getElementById('scene');
  var AC=window.AudioContext||window.webkitAudioContext,ac=AC?new AC():null;
  function ding(ok){if(!ac)return;if(ac.state==='suspended')ac.resume();var o=ac.createOscillator(),g=ac.createGain();o.type='sine';var f=ok?660:200;o.frequency.setValueAtTime(f,ac.currentTime);o.frequency.exponentialRampToValueAtTime(ok?990:120,ac.currentTime+0.15);g.gain.setValueAtTime(0.25,ac.currentTime);g.gain.exponentialRampToValueAtTime(0.001,ac.currentTime+0.3);o.connect(g);g.connect(ac.destination);o.start();o.stop(ac.currentTime+0.3);}
  function emojiSpan(e){var s=document.createElement('span');s.className='em';s.textContent=e;return s;}
  function newRound(){
    msg.textContent='';
    var em=emojis[Math.floor(Math.random()*emojis.length)];
    var sub=Math.random()<0.4;
    var a,b;
    if(sub){a=2+Math.floor(Math.random()*7);b=1+Math.floor(Math.random()*a);answer=a-b;}
    else{a=1+Math.floor(Math.random()*5);b=1+Math.floor(Math.random()*5);answer=a+b;}
    sceneEl.textContent=scenes[Math.floor(Math.random()*scenes.length)];
    qEl.textContent=sub?(a+' - '+b+' = ?'):(a+' + '+b+' = ?');
    shEl.textContent='';
    if(sub){
      /* 减法：a 个图形，划掉 b 个 */
      for(var k=0;k<a;k++){var s=emojiSpan(em);if(k>=a-b){s.style.opacity='.28';s.style.textDecoration='line-through';}shEl.appendChild(s);}
    }else{
      for(var k=0;k<a;k++)shEl.appendChild(emojiSpan(em));
      var p=document.createElement('span');p.className='plus';p.textContent='+';shEl.appendChild(p);
      for(var k2=0;k2<b;k2++)shEl.appendChild(emojiSpan(em));
    }
    /* 生成 3 个选项含正解 */
    var opts=[answer];while(opts.length<3){var c=Math.max(0,answer+(Math.floor(Math.random()*5)-2));if(opts.indexOf(c)<0)opts.push(c);}
    opts.sort(function(){return Math.random()-0.5;});
    optEl.textContent='';
    opts.forEach(function(v){var b2=document.createElement('button');b2.className='opt';b2.textContent=v;
      b2.addEventListener('click',function(){pick(v,b2);});optEl.appendChild(b2);});
  }
  function pick(v,btn){
    if(v===answer){btn.classList.add('ok');ding(true);msg.style.color='#16a34a';msg.textContent='答对啦！🎉';sc++;scEl.textContent=sc;
      if(window.sendToPet)window.sendToPet('math_right',{score:sc});
      setTimeout(newRound,900);
    }else{btn.classList.add('no');ding(false);msg.style.color='#dc2626';msg.textContent='再数一数看～';
      setTimeout(function(){btn.classList.remove('no');},500);}
  }
  newRound();
})();
</script>`;

export const BUILTIN_GAMES: readonly BuiltinGame[] = [
  { id: "builtin-fireworks", title: "梦幻烟花秀", category: "effect", ageRange: [3, 8], icon: "🎆", html: fireworksGame },
  { id: "builtin-piano", title: "钢琴弹儿歌", category: "interactive", ageRange: [3, 8], icon: "🎹", html: pianoGame },
  { id: "builtin-catch-star", title: "接数字星星", category: "game", ageRange: [3, 8], icon: "⭐", html: catchStarGame },
  { id: "builtin-paint", title: "描红学画画", category: "interactive", ageRange: [3, 8], icon: "🎨", html: paintGame },
  { id: "builtin-literacy", title: "认字学拼音", category: "interactive", ageRange: [3, 8], icon: "📖", html: literacyGame },
  { id: "builtin-math", title: "快乐学数学", category: "game", ageRange: [4, 8], icon: "🔢", html: mathGame },
];
