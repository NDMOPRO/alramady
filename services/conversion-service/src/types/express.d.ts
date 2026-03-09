// Express request augmentation is done in src/middleware/auth.ts
// This file ensures the JwtPayload includes 'id' as an alias for 'userId'

import { JwtPayload as AuthJwtPayload } from '../middleware/auth.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthJwtPayload & {
        id?: string;
      };
    }
  }
}

export {};
