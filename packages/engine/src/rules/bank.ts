import type { GameEvent, Loan, Owner, WorldState } from "../types.js";
import { newId } from "../world.js";
import { accountOf, emit } from "./helpers.js";

export function totalDeposits(state: WorldState): number {
  let d = 0;
  for (const f of Object.values(state.families)) d += Math.max(0, f.savings);
  for (const i of Object.values(state.institutions)) d += Math.max(0, i.balance);
  return d;
}

export function loansOutstanding(state: WorldState): number {
  let s = 0;
  for (const l of Object.values(state.bank.loans)) s += l.principal;
  return s;
}

export function lendingCapacity(state: WorldState): number {
  return totalDeposits(state) / state.bank.reserveRatio - loansOutstanding(state);
}

function weeklyPayment(principal: number, weeklyRate: number, weeks: number): number {
  if (weeklyRate <= 0) return principal / weeks;
  return (principal * weeklyRate) / (1 - Math.pow(1 + weeklyRate, -weeks));
}

/**
 * Try to issue a loan. Money is created: the borrower's account is credited and nothing is
 * debited. Returns the loan or null if the bank refuses (capacity or affordability).
 */
export function requestLoan(state: WorldState, borrower: Owner, amount: number, weeklyIncome: number): Loan | null {
  if (amount <= 0) return null;
  if (lendingCapacity(state) < amount) return null;
  const cfg = state.config.bank;
  const existing = borrowerLoans(state, borrower).reduce((s, l) => s + l.weeklyPayment, 0);
  let annual = state.bank.baseRate;
  const trialPayment = weeklyPayment(amount, annual / state.config.ticksPerYear, cfg.loanWeeks);
  if ((trialPayment + existing) / Math.max(1, weeklyIncome) > cfg.maxPaymentToIncome * 0.7) annual += cfg.riskPremium;
  const rate = annual / state.config.ticksPerYear;
  const payment = weeklyPayment(amount, rate, cfg.loanWeeks);
  if ((payment + existing) > cfg.maxPaymentToIncome * weeklyIncome) return null;
  const loan: Loan = { id: newId(state), borrower, principal: amount, weeklyPayment: payment, rate, missed: 0 };
  state.bank.loans[loan.id] = loan;
  const acct = accountOf(state, borrower);
  acct?.add(amount);
  const holder = borrower.kind === "family" ? state.families[borrower.id] : state.institutions[borrower.id];
  holder?.loanIds.push(loan.id);
  return loan;
}

export function borrowerLoans(state: WorldState, borrower: Owner): Loan[] {
  const holder = borrower.kind === "family" ? state.families[borrower.id] : state.institutions[borrower.id];
  if (!holder) return [];
  return holder.loanIds.map((id) => state.bank.loans[id]).filter((l): l is Loan => !!l);
}

/** Collect this week's payments. Principal repaid is destroyed; interest becomes bank income. */
export function serviceLoans(state: WorldState, events: GameEvent[]): void {
  const cfg = state.config.bank;
  for (const loan of Object.values(state.bank.loans)) {
    const acct = accountOf(state, loan.borrower);
    if (!acct) {
      writeOff(state, loan, events);
      continue;
    }
    const interest = loan.principal * loan.rate;
    const due = Math.min(loan.weeklyPayment, loan.principal + interest);
    if (acct.get() >= due) {
      acct.add(-due);
      state.bank.balance += interest;
      state.bank.interestEarned += interest;
      loan.principal -= due - interest;
      loan.missed = 0;
      if (loan.principal <= 0.01) removeLoan(state, loan);
    } else {
      loan.missed++;
      if (loan.missed >= cfg.missedToDefault) {
        writeOff(state, loan, events);
        if (loan.borrower.kind === "family") {
          const f = state.families[loan.borrower.id];
          if (f && f.level > 1) f.level = 1;
        }
      }
    }
  }
}

export function writeOff(state: WorldState, loan: Loan, events: GameEvent[]): void {
  state.bank.balance -= loan.principal;
  state.bank.writeOffs += loan.principal;
  emit(events, state, "default", `Loan ${loan.id} defaulted, ${loan.principal.toFixed(0)} written off`, loan.borrower);
  removeLoan(state, loan);
}

function removeLoan(state: WorldState, loan: Loan): void {
  delete state.bank.loans[loan.id];
  const holder = loan.borrower.kind === "family" ? state.families[loan.borrower.id] : state.institutions[loan.borrower.id];
  if (holder) holder.loanIds = holder.loanIds.filter((id) => id !== loan.id);
}
