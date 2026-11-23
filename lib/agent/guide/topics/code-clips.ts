/** get_guide({ topic: "code-clips" }) — how to draw with a code layer. */
export const codeClipsTopic = `# Code layers

A code layer is the **body** of \`function (ctx, t, u, w, h, p, M) { … }\`, run every frame on a canvas the size of the layer's box.
- \`ctx\` 2D context (cleared every frame) · \`t\` seconds since the layer started · \`u\` progress 0–1 · \`w\`, \`h\` box size in px · \`p\` params · \`M\` helpers.
- **Pure**: the same t gives the same pixels. No Math.random (use a seeded random from M or rnd(i) below), no Date, no timers, no state kept between calls.
- The layer's position, opacity and timing come from the layer; the code only draws.

## Read the standard first
get_example({ style }) has the style's character and places as working code. Read it, and get_element_code on two elements, before your first code layer. Copy their way of drawing: few right shapes, the detail at the silhouette, every move a function of t.

## Small helpers you can define at the top of the body
\`\`\`js
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), lerp=(a,b,k)=>a+(b-a)*k
const pg=(t,a,b)=>clamp((t-a)/(b-a),0,1)            // 0→1 between two times
const eo=k=>1-Math.pow(1-k,3)                       // ease out
const eback=k=>1+2.70158*Math.pow(k-1,3)+1.70158*Math.pow(k-1,2)  // a small overshoot
const rnd=i=>{const x=Math.sin(i*127.1+311.7)*43758.5453;return x-Math.floor(x)}  // seeded 0–1
\`\`\`

## Characters
Each style draws its own character (its brief, <character>): build it once, save_element with params (face, pose, arm), place it by id. Poses and faces **swap** on the line; they never tween. A breath and a blink are the only idle motion.

## Things that appear twice
A room, the hero, a card, the system shot: save_element once with params, place by id. Redrawing them per scene makes them drift.`
