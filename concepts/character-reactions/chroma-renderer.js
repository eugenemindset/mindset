// Full-resolution screen matting. Matte and color always come from the same decoded frame.
export function createChromaRenderer(
  canvas,
  source,
  grainEnabled = () => true,
  edgeMode = () => "clean",
  hasAlpha = () => false,
) {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    preserveDrawingBuffer: true,
  });
  if (!gl) throw Error("WebGL недоступен. Открой сайт в Chrome или Safari.");
  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw Error(gl.getShaderInfoLog(shader));
    return shader;
  }
  const program = gl.createProgram();
  gl.attachShader(
    program,
    compile(
      gl.VERTEX_SHADER,
      `
    attribute vec2 p;varying vec2 uv;
    void main(){gl_Position=vec4(p,0.,1.);uv=vec2((p.x+1.)*.5,(1.-p.y)*.5);}
  `,
    ),
  );
  gl.attachShader(
    program,
    compile(
      gl.FRAGMENT_SHADER,
      `
    precision highp float;
    uniform sampler2D frame;
    uniform float frameNumber,grain,mode,repair,nativeAlpha;
    uniform vec2 displaySize;
    varying vec2 uv;
    vec3 linearColor(vec3 c){return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));}
    vec3 displayColor(vec3 c){return mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(vec3(.0031308),c));}
    float excess(vec3 c){return c.g-dot(c.rb,vec2(.5));}
    float matte(vec3 c,float screen){return clamp((screen-excess(c)-.025)/(screen-.045),0.,1.);}
    float at(vec2 p,float screen){return matte(linearColor(texture2D(frame,p).rgb),screen);}
    void main(){
      vec2 sourceUV=vec2(uv.x,(250.+uv.y*2650.)/3840.);
      vec4 sampleColor=texture2D(frame,sourceUV);
      // Pre-cut video uses its original alpha and RGB, without keying, grain or edge repair.
      if(nativeAlpha>.5){gl_FragColor=vec4(sampleColor.rgb*sampleColor.a,sampleColor.a);return;}
      vec3 color=sampleColor.rgb;
      // Right-side screen samples are clear throughout this clip. The hand touches the LEFT edge.
      vec3 bg=(texture2D(frame,vec2(.980,sourceUV.y)).rgb+
               texture2D(frame,vec2(.990,sourceUV.y)).rgb+
               texture2D(frame,vec2(.995,sourceUV.y)).rgb)/3.;
      vec3 linear=linearColor(color),screenColor=linearColor(bg);
      float screen=max(excess(screenColor),.5);
      float coverage=matte(linear,screen);
      if(coverage<=.001){gl_FragColor=vec4(0.);return;}
      vec2 pixelUV=vec2(1./displaySize.x,2650./3840./displaySize.y);
      float a;
      if(mode<.5){
        // Clean: a tiny 0.1 CSS-pixel choke and a continuous, narrow coverage transition.
        vec2 r=pixelUV*.1;
        float m=min(coverage,min(min(at(sourceUV+vec2(r.x,0.),screen),at(sourceUV-vec2(r.x,0.),screen)),
                                 min(at(sourceUV+vec2(0.,r.y),screen),at(sourceUV-vec2(0.,r.y),screen))));
        a=smoothstep(.28,.72,m);
      }else if(mode<1.5){
        // Crisp: deterministic four-sample area coverage; no stochastic stipple and no erosion.
        vec2 r=pixelUV*.25;
        a=(smoothstep(.46,.54,at(sourceUV+r,screen))+
           smoothstep(.46,.54,at(sourceUV-r,screen))+
           smoothstep(.46,.54,at(sourceUV+vec2(r.x,-r.y),screen))+
           smoothstep(.46,.54,at(sourceUV+vec2(-r.x,r.y),screen)))*.25;
      }else{
        // Fine detail: preserve fractional source coverage, without spatial blur or a hard cut.
        a=smoothstep(.03,.97,coverage);
      }
      if(a<=.001){gl_FragColor=vec4(0.);return;}
      // Reconstruct in linear light to avoid the bright fringe caused by dividing gamma-encoded RGB.
      if(coverage<.999){
        color=displayColor(clamp((linear-screenColor*(1.-coverage))/max(coverage,.001),0.,1.));
        color.g=min(color.g,dot(color.rb,vec2(.5))+.015);
      }
      // The source has a baked-in pale rim, including pixels with fully opaque alpha.
      // Extend foreground COLOR into that band; never erode the silhouette to hide it.
      // Work in source pixels so the correction does not expand when the hero shrinks.
      if(repair>.5){
        vec2 texel=vec2(1./2160.,1./3840.);
        vec2 r=texel*4.;
        float left=at(sourceUV-vec2(r.x,0.),screen);
        float right=at(sourceUV+vec2(r.x,0.),screen);
        float top=at(sourceUV-vec2(0.,r.y),screen);
        float bottom=at(sourceUV+vec2(0.,r.y),screen);
        vec2 gradient=vec2(right-left,bottom-top);
        float strength=length(gradient);
        if(strength>.05){
          vec2 inward=gradient/max(strength,.0001);
          vec3 inner=texture2D(frame,sourceUV+inward*texel*7.).rgb;
          float confidence=smoothstep(.97,.999,matte(linearColor(inner),screen));
          // Neutral metal keeps its own highlights; do not borrow adjacent skin for earrings.
          float warm=smoothstep(.04,.12,inner.r-inner.b)*smoothstep(.025,.08,color.r-color.b);
          float band=1.-smoothstep(.1,.9,min(min(left,right),min(top,bottom)));
          color=mix(color,inner,confidence*warm*band);
        }
      }
      vec2 pixel=floor(uv*displaySize);
      float noise=fract(sin(dot(pixel+frameNumber*vec2(17.,43.),vec2(12.9898,78.233)))*43758.5453)-.5;
      color=clamp(color+noise*grain,0.,1.);
      gl_FragColor=vec4(color*a,a);
    }
  `,
    ),
  );
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const position = gl.getAttribLocation(program, "p");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(gl.getUniformLocation(program, "frame"), 0);
  const frameNumber = gl.getUniformLocation(program, "frameNumber"),
    grain = gl.getUniformLocation(program, "grain"),
    displaySize = gl.getUniformLocation(program, "displaySize"),
    mode = gl.getUniformLocation(program, "mode"),
    repair = gl.getUniformLocation(program, "repair");
  const nativeAlpha = gl.getUniformLocation(program, "nativeAlpha");
  gl.viewport(0, 0, canvas.width, canvas.height);
  return (time) => {
    const video = typeof source === "function" ? source() : source;
    if (!video) return;
    time ??= video.currentTime;
    if (video.readyState < 2) return;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    gl.uniform1f(mode, { clean: 0, crisp: 1, detail: 2 }[edgeMode()] ?? 0);
    gl.uniform1f(repair, edgeMode() === "before" ? 0 : 1);
    gl.uniform1f(nativeAlpha, hasAlpha() ? 1 : 0);
    gl.uniform1f(frameNumber, Math.floor(time * 24 + 0.001));
    gl.uniform1f(grain, grainEnabled() ? 0.018 : 0);
    gl.uniform2f(
      displaySize,
      canvas.clientWidth || canvas.width,
      canvas.clientHeight || canvas.height,
    );
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
}
