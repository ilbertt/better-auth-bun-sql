import { describeGeneratedSchemaConformance } from '../support/conformance-suite.ts';
import { sqliteEngine } from '../support/engines.ts';

describeGeneratedSchemaConformance({
  engines: [sqliteEngine()],
  tablesPrefix: 'auth_',
});
