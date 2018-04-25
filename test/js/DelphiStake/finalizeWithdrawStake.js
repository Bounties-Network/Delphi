/* eslint-env mocha */
/* global contract */

contract('DelphiStake', () => {
  describe('Function: withdrawStake', () => {
    it('should revert if called by any entity other than the staker');
    it('should revert if called before the release time');
    it('should revert if open claims remain');
    it('should set claimableStake to zero');
    it('should transfer the old stake amount to the staker');
    it('should emit a StakeWithdrawn event');
  });
});
