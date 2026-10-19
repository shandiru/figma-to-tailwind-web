import { ApiError } from '../utils/ApiError.js';
import { convertLayers } from './layerService.js';

export async function convertDesign(desktop, mobile, opts) {
  if (!desktop && !mobile) throw new ApiError(400, 'Provide at least one design.');
  return convertLayers(desktop, mobile, opts);
}
