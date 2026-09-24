'use client';

import { BODY_METHODS, endpointKey, useWizard } from '../../wizard/WizardContext';
import { WaitingHint } from '../ui';
import { PayloadTable } from './PayloadTable';

export function PayloadStep() {
  const { endpoints } = useWizard();
  const bodyEndpoints = endpoints.filter((endpoint) => BODY_METHODS.includes(String(endpoint.method).toUpperCase()));

  if (!bodyEndpoints.length) {
    return (
      <div className="space-y-3">
        <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          None of your endpoints send a request body (no POST/PUT/PATCH), so there is nothing to configure here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        Every POST/PUT/PATCH body is shown as an editable table. Rename fields, change types, toggle required, add or remove
        rows, or paste a JSON example - the plan updates as you type.
      </p>

      <div className="space-y-3">
        {bodyEndpoints.map((endpoint) => (
          <PayloadTable key={endpointKey(endpoint)} endpoint={endpoint} />
        ))}
      </div>

      <WaitingHint>
        Edit the tables above directly, or keep answering the payload questions in the chat - both stay in sync.
      </WaitingHint>
    </div>
  );
}
