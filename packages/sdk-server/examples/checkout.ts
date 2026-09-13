import {type ExPressClient} from '../src/index.ts';
export async function checkoutExample(client:ExPressClient,reference:string,storeUrl='http://localhost:3001'){
 const order=await client.createOrder({merchant_order_id:reference,amount:{currency:'JPY',value:'1000'},items:[{name:'Sample',quantity:1,unit_amount:{currency:'JPY',value:'1000'}}]},reference+':order');
 const checkout=await client.createCheckout({order_id:order.id,return_url:storeUrl+'/return',cancel_url:storeUrl+'/cancel'},reference+':checkout');
 return {order,checkout};
}
