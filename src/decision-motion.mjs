/** Visual choreography only; the engine has already sampled the action once. */
export function decisionMotion(baseMs,roll,{reducedMotion=false,compact=false}={}){
 if(!Number.isFinite(roll)||roll<0||roll>=1)throw new RangeError('Invalid decision marker position.');
 const finalPosition=`${roll*100}%`;
 if(reducedMotion)return {duration:0,keyframes:[{left:finalPosition}]};
 const requested=Math.max(0,Number(baseMs)||0);
 const duration=compact?Math.min(450,requested):requested+500;
 // Rapid full-width passes with a short, legible settle at the actual sampled position.
 const passes=Math.max(8,Math.round(duration*.8/115));
 const keyframes=Array.from({length:passes+1},(_,i)=>({left:i%2?'98%':'2%',offset:i/passes*.8}));
 keyframes.push({left:finalPosition,offset:.96},{left:finalPosition,offset:1});
 return {duration,keyframes};
}
