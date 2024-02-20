import { inject } from '@vercel/analytics';

export default defineNuxtPlugin(() => {
    if (process.env.DISABLE_VERCEL_ANALYTICS) {
        inject();
    }
});