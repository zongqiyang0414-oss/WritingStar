import { orderQuad, validQuad } from "./scanGeometry.js";
import { describeDocument } from "./documentScan.js";
import { PAPER_TEMPLATES, PAPER_TEMPLATE_SIZE } from "./paperTemplates.js";

// Four plane correspondences determine a homography, including extrapolation
// from inset registration marks to the actual sheet boundary.
function mapping(from, to) {
  const rows = [];
  for (let i = 0; i < 4; i++) {
    const {x,y}=from[i], {x:u,y:v}=to[i];
    rows.push([x,y,1,0,0,0,-u*x,-u*y,u], [0,0,0,x,y,1,-v*x,-v*y,v]);
  }
  for (let col=0;col<8;col++) {
    let pivot=col;
    for(let r=col+1;r<8;r++)if(Math.abs(rows[r][col])>Math.abs(rows[pivot][col]))pivot=r;
    if(Math.abs(rows[pivot][col])<1e-9)return null;
    [rows[col],rows[pivot]]=[rows[pivot],rows[col]];
    const scale=rows[col][col]; for(let c=col;c<9;c++)rows[col][c]/=scale;
    for(let r=0;r<8;r++)if(r!==col){const factor=rows[r][col];for(let c=col;c<9;c++)rows[r][c]-=factor*rows[col][c];}
  }
  const h=rows.map(r=>r[8]);
  return (x,y)=>{const d=h[6]*x+h[7]*y+1;return {x:(h[0]*x+h[1]*y+h[2])/d,y:(h[3]*x+h[4]*y+h[5])/d};};
}

function components(gray,width,height) {
  const seen=new Uint8Array(gray.length), found=[], stack=[];
  const minArea=Math.max(5,width*height*.000025), maxArea=width*height*.004;
  for(let start=0;start<gray.length;start++) {
    if(seen[start]||gray[start]>95)continue;
    seen[start]=1;stack.push(start);let left=width,right=0,top=height,bottom=0,count=0;
    while(stack.length){
      const p=stack.pop(), x=p%width,y=Math.floor(p/width);count++;
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
      for(const n of [x>0?p-1:-1,x<width-1?p+1:-1,p-width,p+width])
        if(n>=0&&n<gray.length&&!seen[n]&&gray[n]<=95){seen[n]=1;stack.push(n);}
    }
    const w=right-left+1,h=bottom-top+1;
    if(count>=minArea&&count<=maxArea&&w>=2&&h>=2&&w/width<.09&&h/height<.09&&count/(w*h)>.76)
      found.push({x:(left+right)/2,y:(top+bottom)/2,width:w,height:h,area:count});
  }
  // Dense text must not turn the hypothesis search into unbounded work.
  return found.sort((a,b)=>b.area-a.area).slice(0,48);
}

function markRows(points,edge) {
  const groups=new Map(), tolerance=Math.max(1.25,edge*.0035);
  for(let a=0;a<points.length;a++)for(let b=a+1;b<points.length;b++) {
    const dx=points[b].x-points[a].x,dy=points[b].y-points[a].y,len=Math.hypot(dx,dy);
    if(len<edge*.20)continue;
    const members=points.map((p,index)=>({p,index,t:((p.x-points[a].x)*dx+(p.y-points[a].y)*dy)/len}))
      .filter(({p})=>Math.abs((p.x-points[a].x)*dy-(p.y-points[a].y)*dx)/len<tolerance).sort((p,q)=>p.t-q.t);
    const key=members.map(m=>m.index).sort((p,q)=>p-q).join(',');
    if(!groups.has(key))groups.set(key,{members:members.map(m=>m.p),dx:dx/len,dy:dy/len,span:members.at(-1).t-members[0].t});
  }
  const weight=row=>row.members.reduce((sum,p)=>sum+p.area,0);
  return [...groups.values()].sort((a,b)=>weight(b)-weight(a)||b.span-a.span).slice(0,64);
}
const center=m=>({x:m.x+m.width/2,y:m.y+m.height/2});

export function detectTemplateDocument(image) {
  const {width,height,data}=image, edge=Math.max(width,height);
  if(width<100||height<100)return null;
  const gray=new Uint8Array(width*height);
  for(let p=0;p<gray.length;p++)gray[p]=(data[p*4]*77+data[p*4+1]*150+data[p*4+2]*29)>>8;
  const points=components(gray,width,height);
  if(points.length<6)return null;
  const rows=markRows(points,edge), tolerance=Math.max(1.6,edge*.0045);
  let best;
  for(const top of rows)for(const bottom of rows) {
    if(bottom.members.length<4)continue;
    if(top===bottom||Math.abs(top.dx*bottom.dx+top.dy*bottom.dy)<.85)continue;
    if(Math.abs((bottom.members[0].x-top.members[0].x)*top.dy-(bottom.members[0].y-top.members[0].y)*top.dx)<edge*.22)continue;
    for(const template of PAPER_TEMPLATES)for(const reverse of [false,true]) {
      const ordered=list=>[...list].sort((a,b)=>(a.x-b.x)*top.dx+(a.y-b.y)*top.dy);
      const upper=ordered(top.members),lower=ordered(bottom.members);
      if(reverse){upper.reverse();lower.reverse();}
      const t=template.marks, n=template.topCount;
      const anchors=[t[0],t[n-1],t.at(-1),t[n]].map(center);
      const map=mapping(anchors,[upper[0],upper.at(-1),lower.at(-1),lower[0]]);
      if(!map)continue;
      const page=[map(0,0),map(PAPER_TEMPLATE_SIZE.width,0),map(PAPER_TEMPLATE_SIZE.width,PAPER_TEMPLATE_SIZE.height),map(0,PAPER_TEMPLATE_SIZE.height)];
      if(page.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x < -width*.008||p.y < -height*.008||p.x > width*1.008||p.y > height*1.008))continue;
      // Reflection or a homography crossing infinity cannot establish the
      // writing direction, even if sorting its corners yields a convex hull.
      if(!page.every((p,i)=>{const b=page[(i+1)%4],c=page[(i+2)%4];return(b.x-p.x)*(c.y-b.y)-(b.y-p.y)*(c.x-b.x)>0;}))continue;
      const corners=orderQuad(page.map(p=>({x:Math.max(0,Math.min(1,p.x/(width-1))),y:Math.max(0,Math.min(1,p.y/(height-1)))})));
      if(!validQuad(corners,.20))continue;
      const used=new Set(); let error=0;
      for(const mark of t) {
        const c=center(mark), target=map(c.x,c.y);
        const rect=[map(mark.x,mark.y),map(mark.x+mark.width,mark.y),map(mark.x+mark.width,mark.y+mark.height),map(mark.x,mark.y+mark.height)];
        const w=Math.max(...rect.map(p=>p.x))-Math.min(...rect.map(p=>p.x))+1,h=Math.max(...rect.map(p=>p.y))-Math.min(...rect.map(p=>p.y))+1;
        let nearest=-1, distance=tolerance;
        points.forEach((p,i)=>{const d=Math.hypot(p.x-target.x,p.y-target.y);if(!used.has(i)&&d<distance&&p.width/w>.55&&p.width/w<1.65&&p.height/h>.50&&p.height/h<1.8){nearest=i;distance=d;}});
        if(nearest<0)break;
        used.add(nearest);error+=distance;
      }
      // All six/nine marks, including non-anchor marks, must agree. Four
      // arbitrary black blobs or one writing panel cannot trigger a capture.
      if(used.size!==t.length)continue;
      const score=used.size-error/tolerance;
      if(best&&score<=best.score)continue;
      const angle=Math.atan2(page[1].y-page[0].y,page[1].x-page[0].x);
      const quarterTurns=((-Math.round(angle/(Math.PI/2))%4)+4)%4;
      best={corners,confidence:.96,score,templateId:template.id,quarterTurns,markerCount:used.size};
    }
  }
  return best?{...describeDocument(best,gray,width,height),method:"template",templateId:best.templateId,quarterTurns:best.quarterTurns,markerCount:best.markerCount}:null;
}
