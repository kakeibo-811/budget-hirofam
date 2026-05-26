import { el, clear, api, formatYen } from "../utils";
import { t } from "../i18n";
import {
  L,
  ownerText,
  burdenOptions,
  payerOptions as payerOpts,
  frequencyOptions as freqOpts,
  frequencyText,
} from "../i18n/ui";
import { MonthPicker } from "../components/month-picker";

type Account = { id: number; name: string; owner: string };
type FixedItem = any;
type ScheduledItem = any;

function ownerLabel(v: string) {
  return ownerText(v);
}
function opt(value: string, label: string, selected?: boolean) {
  return el("option", { value, selected: selected ? "selected" : null }, [
    label,
  ]);
}
function input(label: string, type = "text", value = ""): HTMLLabelElement {
  const i = el("input", {
    type,
    placeholder: label,
    value,
  }) as HTMLInputElement;
  return el("label", { class: "field" }, [
    el("span", {}, [label]),
    i,
  ]) as HTMLLabelElement;
}
function getInput(label: HTMLElement): HTMLInputElement {
  return label.querySelector("input") as HTMLInputElement;
}
function selectField(
  label: string,
  options: [string, string][],
  value = "",
): HTMLLabelElement {
  const s = el("select") as HTMLSelectElement;
  for (const [v, l] of options) s.appendChild(opt(v, l, v === value));
  return el("label", { class: "field" }, [
    el("span", {}, [label]),
    s,
  ]) as HTMLLabelElement;
}
function getSelect(label: HTMLElement): HTMLSelectElement {
  return label.querySelector("select") as HTMLSelectElement;
}
function ownerOptions(): [string, string][] {
  return burdenOptions();
}
function payerOptions(): [string, string][] {
  return payerOpts();
}
function freqOptions(): [string, string][] {
  return freqOpts();
}

export function renderFixed(root: HTMLElement) {
  clear(root);
  const picker = new MonthPicker();
  const content = el("div", {});
  root.appendChild(picker.element());
  root.appendChild(content);

  async function load(month: string) {
    clear(content);
    content.appendChild(el("div", { class: "muted" }, [t("common.loading")]));
    try {
      const [overview, accounts] = await Promise.all([
        api.get<any>(`/api/fixed-costs/overview?month=${month}`),
        api.get<{ items: Account[] }>("/api/accounts"),
      ]);
      clear(content);
      content.appendChild(
        el("section", { class: "fixed-hero card" }, [
          el("div", { class: "eyebrow" }, [
            L("固定費・支払予定", "FIXED & CASHFLOW"),
          ]),
          el("h2", {}, [
            L("固定費・定期/不定期支払", "Fixed Costs & Scheduled Payments"),
          ]),
          el("p", { class: "muted" }, [
            L(
              "カード支払い以外の定期・不定期支払を登録し、明細・口座支払計画・ダッシュボード・分析へ連携します。",
              "Register recurring and irregular non-card payments and link them to expenses, account cashflow, dashboard, and analytics.",
            ),
          ]),
          el("div", { class: "dashboard-metrics" }, [
            metric(
              L("当月固定費", "This month fixed"),
              overview.summary?.fixed_total || 0,
              L(`${month} / スナップショット`, `${month} / Snapshot`),
            ),
            metric(
              L("未連動", "Unsynced"),
              overview.summary?.unsynced || 0,
              L(
                "明細へ未反映の固定費件数",
                "Fixed-cost rows not synced to expenses",
              ),
              false,
            ),
            metric(
              L("登録済み支払予定", "Scheduled payments"),
              overview.scheduled?.length || 0,
              L("カード外支払い予定件数", "Non-card scheduled payment count"),
              false,
            ),
          ]),
        ]),
      );

      const actions = el("div", { class: "action-row" }, [
        el(
          "button",
          {
            class: "ghost",
            onClick: async () => {
              await api.post("/api/fixed-costs/snapshots/generate", { month });
              await load(month);
            },
          },
          [L("当月スナップショット生成", "Generate monthly snapshot")],
        ),
        el(
          "button",
          {
            class: "primary",
            onClick: async () => {
              if (
                !confirm(
                  L(`${month} の固定費を明細へ連動します。同じスナップショットは二重登録しません。実行しますか？`, `Sync fixed costs for ${month} to expenses? Existing snapshots will not be duplicated.`),
                )
              )
                return;
              const r = await api.post<any>("/api/fixed-costs/sync-month", {
                month,
              });
              alert(L(`作成 ${r.created}件 / 既存 ${r.skipped}件`, `Created ${r.created} / existing ${r.skipped}`));
              await load(month);
            },
          },
          [L("当月固定費を明細へ連動", "Sync monthly fixed costs to expenses")],
        ),
      ]);
      content.appendChild(actions);

      content.appendChild(fixedCreateForm(accounts.items, () => load(month)));
      content.appendChild(
        fixedTable(
          overview.masters || [],
          overview.snapshots || [],
          accounts.items,
          month,
          () => load(month),
        ),
      );
      content.appendChild(
        scheduledSection(overview.scheduled || [], accounts.items, () =>
          load(month),
        ),
      );
    } catch (e: any) {
      clear(content);
      content.appendChild(
        el("div", { class: "banner banner-error" }, [
          `${L("エラー", "Error")}: ${e.message}`,
        ]),
      );
    }
  }

  picker.onChange(load);
  load(picker.get());
}

function metric(
  label: string,
  amount: number,
  sub: string,
  yen = true,
): HTMLElement {
  return el("div", { class: "metric" }, [
    el("div", { class: "metric-label" }, [label]),
    el("div", { class: "metric-value" }, [
      yen ? formatYen(amount) : String(amount),
    ]),
    el("div", { class: "muted" }, [sub]),
  ]);
}

function accountOptions(accounts: Account[]): [string, string][] {
  return [
    ["", L("口座未指定", "No account selected")],
    ...accounts.map(
      (a) =>
        [String(a.id), `${a.name}（${ownerLabel(a.owner)}）`] as [
          string,
          string,
        ],
    ),
  ];
}

function periodLabel(item: any): string {
  const from = item.active_from_month || "";
  const to = item.active_to_month || "";
  if (from && to) return `${from} - ${to}`;
  if (from) return L(`${from} から`, `From ${from}`);
  if (to) return L(`${to} まで`, `Until ${to}`);
  return L("期限なし", "No period limit");
}

function fixedCreateForm(
  accounts: Account[],
  refresh: () => void,
): HTMLElement {
  const box = el("details", { class: "collapse card" }, [
    el("summary", {}, [L("固定費を追加", "Add fixed cost")]),
  ]);
  const name = input(L("名称", "Name"));
  const amount = input(L("金額", "Amount"), "number");
  const payDay = input(L("支払日", "Payment day"), "number");
  const paidBy = selectField(
    L("実際に払う人", "Actual payer"),
    payerOptions(),
    "toshi",
  );
  const burden = selectField(
    L("最終負担", "Final burden"),
    ownerOptions(),
    "shared",
  );
  const account = selectField(
    L("支払口座", "Payment account"),
    accountOptions(accounts),
  );
  const category = input(t("common.category"), "text", "fixed_cost");
  const note = input(t("common.note"));
  const btn = el(
    "button",
    {
      class: "primary",
      onClick: async () => {
        if (!confirm(L("この固定費を追加しますか？", "Add this fixed cost?")))
          return;
        await api.post("/api/fixed-costs", {
          name: getInput(name).value,
          amount: Number(getInput(amount).value || 0),
          pay_day: Number(getInput(payDay).value || 0) || null,
          paid_by: getSelect(paidBy).value,
          burden_owner: getSelect(burden).value,
          owner: getSelect(burden).value,
          split: getSelect(burden).value === "shared" ? 1 : 0,
          account_id: getSelect(account).value || null,
          category: getInput(category).value || "fixed_cost",
          note: getInput(note).value,
        });
        refresh();
      },
    },
    [t("common.add")],
  );
  box.appendChild(
    el("div", { class: "form-grid compact-form" }, [
      name,
      amount,
      payDay,
      paidBy,
      burden,
      account,
      category,
      note,
      btn,
    ]),
  );
  return box;
}

function fixedTable(
  masters: FixedItem[],
  snapshots: FixedItem[],
  accounts: Account[],
  month: string,
  refresh: () => void,
): HTMLElement {
  const card = el("div", { class: "card" }, [
    el("h3", {}, [
      L(
        "固定費マスタ / 当月スナップショット",
        "Fixed cost master / monthly snapshot",
      ),
    ]),
    el("p", { class: "muted" }, [
      L(
        "マスタ変更は今後の予定に、単月変更は当月スナップショットだけに反映できます。明細連動後はダッシュボード・分析・口座ショート監視にも使われます。",
        "Master changes apply forward; single-month changes apply only to that month. Once synced, they feed dashboard, analytics, and cashflow monitoring.",
      ),
    ]),
  ]);
  const wrap = el("div", { class: "table-wrap" });
  const table = el("table", { class: "data compact-table" });
  table.innerHTML = `<thead><tr><th>${L("名称", "Name")}</th><th class="num">${L("マスタ金額", "Master amount")}</th><th class="num">${month}</th><th>${L("支払日", "Payment day")}</th><th>${L("実支払", "Actual payer")}</th><th>${L("負担", "Burden")}</th><th>${L("口座", "Account")}</th><th>${L("連動", "Sync")}</th><th>${t("common.actions")}</th></tr></thead>`;
  const tb = el("tbody");
  if (masters.length === 0)
    tb.appendChild(
      el("tr", {}, [
        el("td", { colspan: "9", class: "muted" }, [
          L("固定費がありません", "No fixed costs"),
        ]),
      ]),
    );
  for (const m of masters) {
    const s = snapshots.find((x) => Number(x.fixed_cost_id) === Number(m.id));
    tb.appendChild(
      el("tr", {}, [
        el("td", {}, [m.name]),
        el("td", { class: "num" }, [formatYen(m.amount)]),
        el("td", { class: "num" }, [
          s ? formatYen(s.amount) : L("未生成", "Not generated"),
        ]),
        el("td", {}, [L(`${m.pay_day || "?"}日`, `Day ${m.pay_day || "?"}`)]),
        el("td", {}, [ownerLabel(m.paid_by || "toshi")]),
        el("td", {}, [ownerLabel(m.burden_owner || m.owner || "shared")]),
        el("td", {}, [m.account_name || "—"]),
        el("td", {}, [
          s?.linked_expense_id || s?.synced_expense_id
            ? L("済", "Done")
            : L("未", "Not yet"),
        ]),
        el("td", { class: "action-cell" }, [
          el(
            "button",
            {
              class: "ghost",
              onClick: async () => editFixed(m, accounts, refresh),
            },
            [t("common.edit")],
          ),
          el(
            "button",
            {
              class: "ghost",
              onClick: async () => editSingleMonth(m, month, refresh),
            },
            [L("単月", "Single month")],
          ),
          el(
            "button",
            {
              class: "ghost danger",
              onClick: async () => {
                if (
                  confirm(
                    L("この固定費を削除しますか？", "Delete this fixed cost?"),
                  )
                ) {
                  await api.delete(`/api/fixed-costs/${m.id}`);
                  refresh();
                }
              },
            },
            [t("common.delete")],
          ),
        ]),
      ]),
    );
  }
  table.appendChild(tb);
  wrap.appendChild(table);
  card.appendChild(wrap);
  return card;
}

async function editFixed(m: any, accounts: Account[], refresh: () => void) {
  const name = prompt(L("名称", "Name"), m.name);
  if (name === null) return;
  const amount = prompt(L("金額", "Amount"), String(m.amount));
  if (amount === null) return;
  const payDay = prompt(L("支払日", "Payment day"), String(m.pay_day || ""));
  if (payDay === null) return;
  const paidBy = prompt(
    L(
      "実際に払う人: toshi / lisa / shared",
      "Actual payer: toshi / lisa / shared",
    ),
    m.paid_by || "toshi",
  );
  if (paidBy === null) return;
  const burden = prompt(
    L(
      "最終負担: shared / lisa / toshi / other",
      "Final burden: shared / lisa / toshi / other",
    ),
    m.burden_owner || m.owner || "shared",
  );
  if (burden === null) return;
  const accountId = prompt(
    `${L("支払口座ID（空欄可）", "Payment account ID (optional)")}\n${accounts.map((a) => `${a.id}: ${a.name}`).join("\n")}`,
    m.account_id || "",
  );
  if (accountId === null) return;
  await api.patch(`/api/fixed-costs/${m.id}`, {
    mode: "forward",
    month: new Date().toISOString().slice(0, 7),
    name,
    amount: Number(amount || 0),
    pay_day: Number(payDay || 0) || null,
    paid_by: paidBy,
    burden_owner: burden,
    owner: burden,
    split: burden === "shared" ? 1 : 0,
    account_id: accountId || null,
  });
  refresh();
}

async function editSingleMonth(m: any, month: string, refresh: () => void) {
  const amount = prompt(
    L(`${month} だけの金額`, `Amount for ${month} only`),
    String(m.amount),
  );
  if (amount === null) return;
  await api.patch(`/api/fixed-costs/${m.id}`, {
    mode: "single",
    month,
    amount: Number(amount || 0),
    paid_by: m.paid_by || "toshi",
    burden_owner: m.burden_owner || m.owner || "shared",
  });
  refresh();
}

function scheduledSection(
  items: ScheduledItem[],
  accounts: Account[],
  refresh: () => void,
): HTMLElement {
  const card = el("div", { class: "card" }, [
    el("h3", {}, [
      L(
        "変動費・その他定期/不定期支払",
        "Variable and other scheduled payments",
      ),
    ]),
    el("p", { class: "muted" }, [
      L(
        "PayPal、定期送金、税金、保険、突発支払いなど。カード明細以外の支払予定として口座ショート監視に入ります。",
        "PayPal, transfers, taxes, insurance, and one-off payments. These are included in cashflow monitoring outside card statements.",
      ),
    ]),
    scheduledForm(accounts, refresh),
  ]);
  const wrap = el("div", { class: "table-wrap" });
  const table = el("table", { class: "data compact-table" });
  table.innerHTML = `<thead><tr><th>${L("名称", "Name")}</th><th class="num">${L("金額", "Amount")}</th><th>${L("頻度", "Frequency")}</th><th>${L("支払時点", "Due timing")}</th><th>${L("支払い期間", "Active period")}</th><th>${L("実支払", "Actual payer")}</th><th>${L("負担", "Burden")}</th><th>${L("口座", "Account")}</th><th>${t("common.actions")}</th></tr></thead>`;
  const tb = el("tbody");
  if (items.length === 0)
    tb.appendChild(
      el("tr", {}, [
        el("td", { colspan: "9", class: "muted" }, [
          L("支払予定がありません", "No scheduled payments"),
        ]),
      ]),
    );
  for (const p of items) {
    const due =
      p.frequency === "monthly"
        ? L(`毎月${p.due_day || "?"}日`, `Monthly day ${p.due_day || "?"}`)
        : p.frequency === "once"
          ? p.due_date || L("日付未定", "No date")
          : (p.frequency === "every_3_years" || p.frequency === "every_5_years")
            ? L(`${p.recurrence_start_year || String(p.due_date || '').slice(0,4) || '2026'}年から${p.frequency === 'every_3_years' ? '3' : '5'}年ごと ${p.due_month || '?'}月${p.due_day || '?'}日`, `Every ${p.frequency === 'every_3_years' ? '3' : '5'} years from ${p.recurrence_start_year || String(p.due_date || '').slice(0,4) || '2026'} on ${p.due_month || '?'}-${p.due_day || '?'}`)
            : L(
                `${p.due_month || "?"}月${p.due_day || "?"}日`,
                `${p.due_month || "?"}-${p.due_day || "?"}`,
              );
    tb.appendChild(
      el("tr", {}, [
        el("td", {}, [p.name]),
        el("td", { class: "num" }, [formatYen(p.amount)]),
        el("td", {}, [frequencyText(p.frequency)]),
        el("td", {}, [due]),
        el("td", {}, [periodLabel(p)]),
        el("td", {}, [ownerLabel(p.paid_by)]),
        el("td", {}, [ownerLabel(p.burden_owner)]),
        el("td", {}, [p.account_name || "—"]),
        el("td", { class: "action-cell" }, [
          el(
            "button",
            {
              class: "ghost",
              onClick: () => editScheduled(p, accounts, refresh),
            },
            [t("common.edit")],
          ),
          el(
            "button",
            {
              class: "ghost danger",
              onClick: async () => {
                if (confirm(L("削除しますか？", "Delete this item?"))) {
                  await api.delete(`/api/scheduled-payments/${p.id}`);
                  refresh();
                }
              },
            },
            [t("common.delete")],
          ),
        ]),
      ]),
    );
  }
  table.appendChild(tb);
  wrap.appendChild(table);
  card.appendChild(wrap);
  return card;
}

function scheduledForm(accounts: Account[], refresh: () => void): HTMLElement {
  const box = el("details", { class: "collapse" }, [
    el("summary", {}, [L("支払予定を追加", "Add scheduled payment")]),
  ]);
  const name = input(L("名称", "Name"));
  const amount = input(L("金額", "Amount"), "number");
  const frequency = selectField(
    L("頻度", "Frequency"),
    freqOptions(),
    "monthly",
  );
  const dueDay = input(L("支払日/日", "Payment day"), "number");
  const dueMonth = input(L("支払月", "Payment month"), "number");
  const recurrenceStartYear = input(L("開始年（3年/5年ごと）", "Start year (3/5-year)"), "number", "2026");
  const dueDate = input(L("1回のみの日付", "One-time date"), "date");
  const activeFrom = input(L("支払い開始月", "Active from month"), "month");
  const activeTo = input(L("支払い終了月", "Active to month"), "month");
  const paidBy = selectField(
    L("実際に払う人", "Actual payer"),
    payerOptions(),
    "toshi",
  );
  const burden = selectField(
    L("最終負担", "Final burden"),
    ownerOptions(),
    "shared",
  );
  const account = selectField(
    L("支払口座", "Payment account"),
    accountOptions(accounts),
  );
  const category = input("カテゴリ", "text", "scheduled_payment");
  const note = input(t("common.note"));
  const btn = el(
    "button",
    {
      class: "primary",
      onClick: async () => {
        if (
          !confirm(
            L("この支払予定を追加しますか？", "Add this scheduled payment?"),
          )
        )
          return;
        await api.post("/api/scheduled-payments", {
          name: getInput(name).value,
          amount: Number(getInput(amount).value || 0),
          frequency: getSelect(frequency).value,
          due_day: Number(getInput(dueDay).value || 0) || null,
          due_month: Number(getInput(dueMonth).value || 0) || null,
          recurrence_start_year: Number(getInput(recurrenceStartYear).value || 0) || null,
          interval_years: getSelect(frequency).value === 'every_3_years' ? 3 : getSelect(frequency).value === 'every_5_years' ? 5 : null,
          due_date: getInput(dueDate).value || null,
          active_from_month: getInput(activeFrom).value || null,
          active_to_month: getInput(activeTo).value || null,
          paid_by: getSelect(paidBy).value,
          burden_owner: getSelect(burden).value,
          split: getSelect(burden).value === "shared" ? 1 : 0,
          account_id: getSelect(account).value || null,
          category: getInput(category).value || "scheduled_payment",
          note: getInput(note).value,
        });
        refresh();
      },
    },
    [t("common.add")],
  );
  box.appendChild(
    el("div", { class: "form-grid compact-form" }, [
      name,
      amount,
      frequency,
      dueDay,
      dueMonth,
      recurrenceStartYear,
      dueDate,
      activeFrom,
      activeTo,
      paidBy,
      burden,
      account,
      category,
      note,
      btn,
    ]),
  );
  return box;
}

async function editScheduled(p: any, accounts: Account[], refresh: () => void) {
  const name = prompt("名称", p.name);
  if (name === null) return;
  const amount = prompt("金額", String(p.amount));
  if (amount === null) return;
  const frequency = prompt(
    L(
      "頻度: monthly / once / yearly / every_3_years / every_5_years / irregular",
      "Frequency: monthly / once / yearly / every_3_years / every_5_years / irregular",
    ),
    p.frequency || "monthly",
  );
  if (frequency === null) return;
  const dueDay = prompt(L("支払日/日", "Payment day"), String(p.due_day || ""));
  if (dueDay === null) return;
  const dueDate = prompt(
    L(
      "1回のみの日付 YYYY-MM-DD（空欄可）",
      "One-time date YYYY-MM-DD (optional)",
    ),
    p.due_date || "",
  );
  if (dueDate === null) return;
  const dueMonth = prompt(L("支払月（年次/3年/5年ごと）", "Payment month (yearly/3y/5y)"), String(p.due_month || ""));
  if (dueMonth === null) return;
  const recurrenceStartYear = prompt(L("開始年（3年/5年ごと）", "Start year (3/5-year)"), String(p.recurrence_start_year || String(p.due_date || '').slice(0,4) || "2026"));
  if (recurrenceStartYear === null) return;
  const activeFrom = prompt(L("支払い開始月 YYYY-MM（空欄可）", "Active from month YYYY-MM (optional)"), p.active_from_month || "");
  if (activeFrom === null) return;
  const activeTo = prompt(L("支払い終了月 YYYY-MM（空欄可）", "Active to month YYYY-MM (optional)"), p.active_to_month || "");
  if (activeTo === null) return;
  const paidBy = prompt(
    L(
      "実際に払う人: toshi / lisa / shared",
      "Actual payer: toshi / lisa / shared",
    ),
    p.paid_by || "toshi",
  );
  if (paidBy === null) return;
  const burden = prompt(
    L(
      "最終負担: shared / lisa / toshi / other",
      "Final burden: shared / lisa / toshi / other",
    ),
    p.burden_owner || "shared",
  );
  if (burden === null) return;
  const accountId = prompt(
    `${L("支払口座ID（空欄可）", "Payment account ID (optional)")}\n${accounts.map((a) => `${a.id}: ${a.name}`).join("\n")}`,
    p.account_id || "",
  );
  if (accountId === null) return;
  await api.patch(`/api/scheduled-payments/${p.id}`, {
    name,
    amount: Number(amount || 0),
    frequency,
    due_day: Number(dueDay || 0) || null,
    due_month: Number(dueMonth || 0) || null,
    recurrence_start_year: Number(recurrenceStartYear || 0) || null,
    interval_years: frequency === 'every_3_years' ? 3 : frequency === 'every_5_years' ? 5 : null,
    due_date: dueDate || null,
    active_from_month: activeFrom || null,
    active_to_month: activeTo || null,
    paid_by: paidBy,
    burden_owner: burden,
    split: burden === "shared" ? 1 : 0,
    account_id: accountId || null,
  });
  refresh();
}
