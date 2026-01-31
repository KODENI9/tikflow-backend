import { StrictAuthProp } from '@clerk/clerk-sdk-node';

declare global {
  namespace Express {
    // On fusionne notre interface avec celle d'Express
    interface Request extends StrictAuthProp {}
  }
}