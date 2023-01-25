export type Options = {
  halfTimeout?: number
  openTimeout?: number
  minFailed?: number
  percentFailed?: number
}

enum State {
  OPENED = "OPENED",
  CLOSED = "CLOSED",
  HALF = "HALF"
}

export class CircuitBreaker<PAYLOAD> {
  options: Required<Options>
  state = State.CLOSED
  openDateEnd: number | undefined = undefined
  halfDateEnd: number | undefined = undefined
  failCount = 0
  successCount = 0

  constructor(
    private request: (...args: any[]) => Promise<PAYLOAD>,
    opts?: Options
  ) {
    this.options = {
      halfTimeout: opts?.halfTimeout || 10000,
      openTimeout: opts?.openTimeout || 5000,
      minFailed: opts?.minFailed || 15,
      percentFailed: opts?.percentFailed || 50
    }
  }
  private getInfo() {
    return {
      state: this.state,
      openDateEnd: new Date(this.openDateEnd || 0),
      halfDateEnd: new Date(this.halfDateEnd || 0)
    }
  }

  async fire(...args: any[]): Promise<any> {
    if (this.state === State.OPENED && (Date.now() < this.openDateEnd!)) {
      throw new Error('The circuit is open')
    }
    try {
      const response = await this.request(args)
      return this.success({ response: response, ...this.getInfo() })
    } catch (e: any) {
      return this.fail({ response: e, ...this.getInfo() }, args)
    }
  }

  private reset() {
    this.successCount = 0
    this.failCount = 0
    this.halfDateEnd = undefined
  }

  private setOpenDate() {
    this.openDateEnd = Date.now() + this.options.openTimeout
  }
  private setHalfDate() {
    this.halfDateEnd = Date.now() + this.options.halfTimeout
  }

  private getFailRate() {
    return this.failCount * 100 / (this.failCount + this.successCount)
  }

  private success(response: any): any {
    switch (this.state) {
      case State.HALF:
        this.successCount++
        if (Date.now() >= this.halfDateEnd!) {
          this.state = State.CLOSED
          this.reset()
        }
      case State.OPENED:
        this.successCount = 1
        this.state = State.HALF
        this.setHalfDate()
      case State.CLOSED:
        this.successCount++
    }
    return response
  }

  private fail(e: any, args: any[]): any {
    switch (this.state) {
      case State.OPENED:
        this.setOpenDate()
        return e

      case State.CLOSED:
        this.failCount = 1
        this.state = State.HALF
        this.setHalfDate()
        return e

      case State.HALF:
        this.failCount++

        if (Date.now() > this.halfDateEnd!) {
          this.reset()
          this.failCount = 1
          this.setHalfDate()
          return e
        }

        if (this.failCount >= this.options.minFailed) {
          if (this.getFailRate() >= this.options.percentFailed) {
            this.state = State.OPENED
            this.reset()
            this.setOpenDate()
            return e
          }
          this.reset()
          this.failCount = 1
          this.setHalfDate()
          return e
        }
    }
  }
}