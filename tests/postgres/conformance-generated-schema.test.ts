import { describeGeneratedSchemaConformance } from '../support/conformance-suite.ts';
import { latestPostgresEngine } from '../support/engines.ts';

// One major is enough: what is under test is how the adapter renders SQL, and
// `conformance.test.ts` already covers all three.
describeGeneratedSchemaConformance({
  engines: [latestPostgresEngine({ database: 'better_auth_conformance_prefixed' })],
  tablesPrefix: 'auth_',
});
