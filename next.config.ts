import type {NextConfig} from 'next';
const coolify=process.env.ZAPSTICK_BUILD_TARGET==='coolify';
const nextConfig:NextConfig={
 ...(coolify?{output:'standalone',distDir:'.next-coolify',typescript:{tsconfigPath:'tsconfig.coolify.json'}}:{}),
 agentRules:false,
 devIndicators:false,
 poweredByHeader:false,
 async headers(){return [{source:'/(.*)',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'no-referrer'}]}];},
};
export default nextConfig;
