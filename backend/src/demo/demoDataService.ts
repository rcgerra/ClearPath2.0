import { env } from '../config/env';
import { CsvDataService } from './csvData';

/** Single in-memory sample data instance shared by the demo router and demo-aware services. */
export const demoDataService = env.demoMode ? new CsvDataService() : CsvDataService.empty();
