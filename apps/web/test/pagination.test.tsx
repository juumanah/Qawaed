import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { pageForTotal } from "../lib/pagination";
import { FilingList } from "../components/workspace/filing-list";

test("approving the last filing on page two returns to the first page", () => {
  assert.equal(pageForTotal(2, 21), 2);
  assert.equal(pageForTotal(2, 20), 1);
});

test("concurrent decisions can remove several pages, including all results", () => {
  assert.equal(pageForTotal(4, 22), 2);
  assert.equal(pageForTotal(4, 0), 1);
});

function list(page: number, total: number) {
  return renderToStaticMarkup(
    <FilingList lang="en" items={[]} total={total} page={page}
      status="UNDER_REVIEW" counts={{ UNDER_REVIEW: total }} loading={false}
      search="" role="AUDITOR" setSearch={() => {}} chooseStatus={() => {}}
      changePage={() => {}} open={async () => {}} />,
  );
}

test("the list retains a way back while an out-of-range page is corrected", () => {
  assert.match(list(2, 20), /class="pagination"/);
  assert.match(list(2, 20), /Previous/);
});

test("a single valid page does not need pagination controls", () => {
  assert.doesNotMatch(list(1, 20), /class="pagination"/);
});
