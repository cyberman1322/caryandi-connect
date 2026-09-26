import {createFileRoute} from '@tanstack/react-router'; import {AuthPage} from '@/components/caryandi/auth-pages';
export const Route=createFileRoute('/reset-password')({head:()=>({meta:[{title:'Choose a New Password — My Car Zambia'},{name:'description',content:'Set a new password for your My Car Zambia account.'},{name:'robots',content:'noindex'}]}),component:()=> <AuthPage mode="reset"/>});
