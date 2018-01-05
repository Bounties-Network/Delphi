/* eslint-env mocha */
/* global contract */

contract('DelphiStake', () => {
  describe('Function: initiateWithdrawStake', () => {
    it('should revert if called by any entity other than the staker');
    it('should set lockupEnding to now + lockupPeriod');
    it('should set lockupRemaining to now + lockupPeriod');
    it('should emit a StakeWithdrawInitiated event');
  });
});

