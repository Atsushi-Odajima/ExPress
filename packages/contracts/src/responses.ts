const decimal={type:'string',pattern:'^[0-9]+$',description:'JPY最小単位の10進整数文字列。浮動小数ではない。',examples:['12000']};
export const resourceSchema={type:'object',additionalProperties:true,required:['id','status','currency','amount'],properties:{id:{type:'string'},workspace_id:{type:'string'},generation:{type:'integer'},merchant_id:{type:['string','null']},user_id:{type:['string','null']},parent_id:{type:['string','null']},business_key:{type:['string','null']},status:{type:'string'},currency:{const:'JPY',type:'string'},amount:decimal,captured:decimal,refunded:decimal,reserved:decimal,released:decimal,version:{type:'integer'},created_at:{type:'string',format:'date-time'},updated_at:{type:'string',format:'date-time'},data:{type:'object',additionalProperties:true}}};
const states:Record<string,string[]>={orders:['created','pending','authorized','captured','partially_captured','partially_refunded','refunded','cancelled','voided','expired'],'checkout-sessions':['created','approved','cancelled','expired'],authorizations:['pending','authorized','partially_captured','captured','voided','expired','failed'],captures:['pending','succeeded','failed'],refunds:['pending','succeeded','failed'],payouts:['requested','processing','succeeded','failed','cancelled'],subscriptions:['pending_consent','active','past_due','paused','cancelled']};
export function responseSchema(method:string,url:string):any{
 let name=url.split('/')[2];if(url.endsWith('/capture'))name='captures';if(url.endsWith('/refunds'))name='refunds';
 if(url==='/v1/balances'||url==='/v1/me/balances')return {type:'object',additionalProperties:true,required:['currency','available'],properties:{currency:{type:'string',const:'JPY'},available:decimal,held:decimal,unsettled:decimal,payout_held:decimal,refund_held:decimal}};
 if(url==='/v1/oauth/token')return {type:'object',required:['access_token','token_type','expires_in'],properties:{access_token:{type:'string',description:'サーバー専用。ログやブラウザへ保存しない。'},token_type:{type:'string'},expires_in:{type:'integer'},scope:{type:'string'}},additionalProperties:true};
 if(states[name]&&url.startsWith('/v1/')){
  const resource={...resourceSchema,properties:{...resourceSchema.properties,status:{type:'string',enum:states[name]}}};
  if(method==='GET'&&url==='/v1/'+name)return {type:'object',required:['data','next_cursor'],properties:{data:{type:'array',items:resource},next_cursor:{type:['string','null']}},additionalProperties:true};
  return resource;
 }
 return {type:'object',additionalProperties:true};
}
export const listQuerySchema={type:'object',additionalProperties:true,properties:{cursor:{type:'string',maxLength:500,description:'前ページのnext_cursor。順序はUTC created_atとID。'},limit:{type:'integer',minimum:1,maximum:100,default:25},q:{type:'string',maxLength:100},status:{type:'string',maxLength:40},from:{type:'string',format:'date-time'},to:{type:'string',format:'date-time'},format:{type:'string',enum:['json','csv']}}};
