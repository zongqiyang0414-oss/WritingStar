import { ReadableStream } from 'web-streams-polyfill';
// PDF.js uses browser path/matrix objects even with font faces disabled. These
// adapters replay paths on WeChat's Canvas2D; document bytes never leave device.
export class PdfMatrix {
  constructor(values = [1, 0, 0, 1, 0, 0]) { this.set(values); }
  set(v) { [this.a, this.b, this.c, this.d, this.e, this.f] = Array.from(v); this.is2D = true; return this; }
  values() { return [this.a, this.b, this.c, this.d, this.e, this.f]; }
  multiplySelf(m) { const {a,b,c,d,e,f}=this; return this.set([a*m.a+c*m.b,b*m.a+d*m.b,a*m.c+c*m.d,b*m.c+d*m.d,a*m.e+c*m.f+e,b*m.e+d*m.f+f]); }
  preMultiplySelf(m) { return this.set(new PdfMatrix(m.values ? m.values() : [m.a,m.b,m.c,m.d,m.e,m.f]).multiplySelf(this).values()); }
  multiply(m) { return new PdfMatrix(this.values()).multiplySelf(m); }
  translateSelf(x=0,y=0) { return this.multiplySelf(new PdfMatrix([1,0,0,1,x,y])); }
  translate(x=0,y=0) { return new PdfMatrix(this.values()).translateSelf(x,y); }
  scaleSelf(x=1,y=x) { return this.multiplySelf(new PdfMatrix([x,0,0,y,0,0])); }
  scale(x=1,y=x) { return new PdfMatrix(this.values()).scaleSelf(x,y); }
  rotateSelf(degrees=0) { const r=degrees*Math.PI/180;return this.multiplySelf(new PdfMatrix([Math.cos(r),Math.sin(r),-Math.sin(r),Math.cos(r),0,0])); }
  rotate(degrees=0) { return new PdfMatrix(this.values()).rotateSelf(degrees); }
  invertSelf() { const {a,b,c,d,e,f}=this,det=a*d-b*c;return this.set([d/det,-b/det,-c/det,a/det,(c*f-d*e)/det,(b*e-a*f)/det]); }
  inverse() { return new PdfMatrix(this.values()).invertSelf(); }
  transformPoint({x=0,y=0}={}) { return {x:this.a*x+this.c*y+this.e,y:this.b*x+this.d*y+this.f}; }
}
export class PdfPath {
  constructor(path) { this.commands = path instanceof PdfPath ? [...path.commands] : []; if (typeof path === 'string' && path) throw new Error('此PDF包含暂不支持的SVG路径，请使用网页版导入。'); }
  addPath(path, matrix) { this.commands.push(['path',path,matrix]); }
  replay(ctx) { for(const [method,...args] of this.commands) { if(method==='path'){ctx.save();if(args[1])ctx.transform(args[1].a,args[1].b,args[1].c,args[1].d,args[1].e,args[1].f);args[0].replay(ctx);ctx.restore();}else ctx[method](...args); } }
}
for (const method of ['moveTo','lineTo','bezierCurveTo','quadraticCurveTo','closePath','rect','arc','arcTo','ellipse','roundRect'])
  PdfPath.prototype[method] = function(...args) { this.commands.push([method,...args]); };

export function clonePdfMessage(value, seen = new Map()) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  // PDF.js compatibility shims can wrap constructors. Brand checks also keep
  // font-path ArrayBuffers intact across the engine's separate module realm.
  const tag=Object.prototype.toString.call(value);
  if (tag==='[object ArrayBuffer]') return value.slice(0);
  if (ArrayBuffer.isView(value)) return tag==='[object DataView]' ? new DataView(value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength)) : new value.constructor(value);
  if(tag==='[object Date]')return new Date(value.getTime());
  const output = tag==='[object Map]' ? new Map() : tag==='[object Set]' ? new Set() : Array.isArray(value) ? [] : {};
  seen.set(value,output);
  if (tag==='[object Map]') for (const [key,item] of value) output.set(clonePdfMessage(key,seen),clonePdfMessage(item,seen));
  else if (tag==='[object Set]') for (const item of value) output.add(clonePdfMessage(item,seen));
  else for (const key of Object.keys(value)) output[key]=clonePdfMessage(value[key],seen);
  return output;
}
export function installPdfCanvasGlobals(target = globalThis) {
  target.DOMMatrix ||= PdfMatrix; target.Path2D ||= PdfPath;
  target.ReadableStream ||= ReadableStream;
  target.structuredClone ||= value => clonePdfMessage(value);
  target.Blob ||= class {
    constructor(parts=[],options={}) { const arrays=parts.map(part=>typeof part==='string'?new Uint8Array(Array.from(unescape(encodeURIComponent(part)),char=>char.charCodeAt(0))):part instanceof ArrayBuffer?new Uint8Array(part):new Uint8Array(part.buffer,part.byteOffset||0,part.byteLength));this.size=arrays.reduce((n,a)=>n+a.length,0);this.type=options.type||'';this.data=new Uint8Array(this.size);let offset=0;for(const array of arrays){this.data.set(array,offset);offset+=array.length;} }
    async arrayBuffer(){return this.data.slice().buffer;} async bytes(){return this.data.slice();}
    slice(start=0,end=this.size,type=''){return new target.Blob([this.data.slice(start,end)],{type});}
  };
  target.Response ||= class {
    constructor(body){this.body=new target.Blob([body]);}arrayBuffer(){return this.body.arrayBuffer();}bytes(){return this.body.bytes();}
  };
  target.DOMException ||= class extends Error {constructor(message,name='Error'){super(message);this.name=name;}};
  target.TextEncoder ||= class {encode(text=''){return new Uint8Array(Array.from(unescape(encodeURIComponent(text)),char=>char.charCodeAt(0)));}};
  target.TextDecoder ||= class {
    constructor(encoding='utf-8'){this.encoding=encoding.toLowerCase();}
    decode(input=new Uint8Array()){
      const bytes=input instanceof ArrayBuffer?new Uint8Array(input):new Uint8Array(input.buffer,input.byteOffset,input.byteLength);let result='';
      if(this.encoding==='utf-16be'||this.encoding==='utf-16le'){for(let i=0;i+1<bytes.length;i+=2)result+=String.fromCharCode(this.encoding==='utf-16be'?bytes[i]*256+bytes[i+1]:bytes[i]+bytes[i+1]*256);return result;}
      for(let i=0;i<bytes.length;i++)result+=String.fromCharCode(bytes[i]);
      return this.encoding==='utf-8'?decodeURIComponent(escape(result)):result;
    }
  };
  if(!target.AbortController){
    target.AbortSignal=class {constructor(){this.aborted=false;this.listeners=new Set();}addEventListener(type,callback){if(type==='abort')this.listeners.add(callback);}removeEventListener(type,callback){this.listeners.delete(callback);}throwIfAborted(){if(this.aborted)throw this.reason;}static any(signals){const controller=new target.AbortController();for(const signal of signals){if(signal.aborted){controller.abort(signal.reason);break;}signal.addEventListener('abort',()=>controller.abort(signal.reason));}return controller.signal;}};
    target.AbortController=class {constructor(){this.signal=new target.AbortSignal();}abort(reason=new target.DOMException('Aborted','AbortError')){if(this.signal.aborted)return;this.signal.aborted=true;this.signal.reason=reason;for(const callback of this.signal.listeners)callback({type:'abort'});this.signal.listeners.clear();}};
  }
  target.ImageData ||= class { constructor(data,width,height) { this.data=data;this.width=width;this.height=height||data.length/4/width; } };
}
export function pdfCanvasContext(canvas) {
  const context=canvas.getContext('2d'); let matrix=new PdfMatrix(), stack=[];
  return new Proxy(context, { get(ctx,key) {
    if (key==='getTransform') return () => new PdfMatrix(matrix.values());
    if (['fill','clip','stroke'].includes(key)) return (path,...args) => { if (path instanceof PdfPath) { ctx.beginPath(); path.replay(ctx);return ctx[key](...args); } return path === undefined ? ctx[key]() : ctx[key](path,...args); };
    if (key==='save') return () => { stack.push(new PdfMatrix(matrix.values()));ctx.save(); };
    if (key==='restore') return () => { matrix=stack.pop()||new PdfMatrix();ctx.restore(); };
    if (key==='setTransform') return (...args) => { matrix=args.length===1 ? new PdfMatrix([args[0].a,args[0].b,args[0].c,args[0].d,args[0].e,args[0].f]) : new PdfMatrix(args);ctx.setTransform(...matrix.values()); };
    if (key==='resetTransform') return () => { matrix=new PdfMatrix();ctx.setTransform(1,0,0,1,0,0); };
    if (key==='transform') return (...args) => { matrix.multiplySelf(new PdfMatrix(args));ctx.transform(...args); };
    if (key==='translate') return (x,y) => { matrix.translateSelf(x,y);ctx.translate(x,y); };
    if (key==='scale') return (x,y) => { matrix.scaleSelf(x,y);ctx.scale(x,y); };
    if (key==='rotate') return r => { matrix.rotateSelf(r*180/Math.PI);ctx.rotate(r); };
    const value=ctx[key];return typeof value==='function' ? value.bind(ctx) : value;
  }, set(ctx,key,value) {ctx[key]=value;return true;} });
}
