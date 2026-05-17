// Enda stället som äger "nu" — gör datumlogik injicerbar för tester.
// All annan kod importerar getNow() istället för att anropa new Date() direkt.

let _mockNow: number | null = null;

export function setMockNow(ms: number | null): void {
  _mockNow = ms;
}

export function getNow(): Date {
  return _mockNow !== null ? new Date(_mockNow) : new Date();
}
