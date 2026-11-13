/**
 * Netlify Serverless API Entry Point (LinkHub v2.0.0)
 * Wraps the shared hardened Express API via serverless-http.
 */

import serverless from 'serverless-http';
import { createApiApp } from '../../server/app.ts';

const apiApp = createApiApp();

export const handler = serverless(apiApp);
