/** Public API amounts are decimal integer strings; never JavaScript floating point. */
export interface Money {currency:'JPY';value:string;}
export interface OrderInput {merchant_order_id:string;amount:Money;description?:string;items:{name:string;quantity:number;unit_amount:Money}[];metadata?:Record<string,unknown>;}
export interface CheckoutInput {order_id:string;return_url:string;cancel_url:string;}
export interface CaptureInput {amount:Money;final_capture?:boolean;}
export interface RefundInput {amount:Money;reason?:string;}
export interface Resource<S extends string=string> {id:string;workspace_id:string;generation:number;merchant_id:string|null;user_id:string|null;parent_id:string|null;business_key:string|null;currency:'JPY';amount:string;captured:string;refunded:string;reserved:string;released:string;status:S;version:number;created_at:string;updated_at:string;data:Record<string,any>;operation_id?:string;}
export type Authorization=Resource<'pending'|'authorized'|'partially_captured'|'captured'|'voided'|'expired'|'failed'>;
export type Capture=Resource<'pending'|'succeeded'|'failed'>;
export type Refund=Resource<'pending'|'succeeded'|'failed'>;
export type CheckoutSession=Resource<'created'|'approved'|'cancelled'|'expired'>;
export type Order=Resource<'created'|'pending'|'authorized'|'captured'|'partially_captured'|'partially_refunded'|'refunded'|'cancelled'|'voided'|'expired'>;
export interface OrderDetails extends Order {authorizations:Authorization[];captures:Capture[];}
