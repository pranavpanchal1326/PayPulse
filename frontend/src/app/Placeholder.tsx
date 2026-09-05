import { EmptyState, Button } from "@/components/system";
import { PageHeader } from "./Shell";

/**
 * A route that exists, is guarded, and is honest about not being built yet.
 * Each one names the phase that fills it, so the shell can be walked
 * end-to-end without pretending the product is further along than it is.
 */
export function Placeholder({ title, block }: { title: string; block: string }) {
  return (
    <>
      <PageHeader title={title} meta={`Arrives in ${block}.`} />
      <div className="pp-well" style={{ padding: "var(--s-5)" }}>
        <EmptyState
          title={`${title} is not built yet`}
          body={`The route, its permission guard and its place in the shell are done. The screens land in ${block}.`}
          action={<Button variant="quiet" onClick={() => history.back()}>Go back</Button>}
        />
      </div>
    </>
  );
}
