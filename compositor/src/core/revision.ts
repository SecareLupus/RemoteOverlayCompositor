export class RevisionCounter {
  private current: number;

  constructor(initialRevision = 1) {
    this.current = initialRevision;
  }

  public value(): number {
    return this.current;
  }

  public bump(): number {
    this.current += 1;
    return this.current;
  }
}
