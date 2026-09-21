import {createFileRoute} from '@tanstack/react-router'; import {AuthPage} from '@/components/caryandi/auth-pages';
export const Route=createFileRoute('/reset-password')({head:()=>({meta:[{title:'Choose a New Password — Caryandi'},{name:'description',content:'Set a new password for your Caryandi account.'},{name:'robots',content:'noindex'}]}),component:()=> <AuthPage mode="reset"/>});
