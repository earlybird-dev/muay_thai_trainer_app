import { useEffect, useRef } from 'react';
import { useDialog } from './Dialog';
import { addDemoData, removeDemoData } from '../lib/demoData';
import { useAuth } from '../lib/auth';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';

/**
 * Local development only: open any page with ?demo-data=add to put sample practice data
 * into the current profile (it syncs like any change), or ?demo-data=remove to take it out.
 */
export default function DemoDataLink() {
  const { update } = useStore();
  const { account, ready } = useAuth();
  const dialog = useDialog();
  const done = useRef(false);

  useEffect(() => {
    if (!import.meta.env.DEV || done.current || !ready) return;
    const url = new URL(window.location.href);
    const action = url.searchParams.get('demo-data');
    if (action !== 'add' && action !== 'remove') return;
    done.current = true;
    url.searchParams.delete('demo-data');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);

    void (async () => {
      if (action === 'add') {
        update(addDemoData);
        await dialog.alert({ title: 'Sample data added', message: 'About 9 weeks of practice, two workouts and a plan in progress. Open with ?demo-data=remove to take it out again.' });
        return;
      }
      // Sessions merge back from the account, so delete the sample ones there first.
      if (supabase && account) {
        const { error } = await supabase.from('sessions').delete().eq('user_id', account.id).like('id', 'demo-%');
        if (error) {
          await dialog.alert({ title: 'Could not remove sample data', message: error.message });
          return;
        }
      }
      update((d) => removeDemoData(d));
      await dialog.alert({ title: 'Sample data removed', message: 'Your own sessions, workouts and plans are untouched.' });
    })();
  }, [ready, account, update, dialog]);

  return null;
}
