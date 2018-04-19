/* eslint-env mocha */
/* global contract */

contract('DelphiStake', () => {
  describe('Function: withdrawStake', () => {
    it('should revert if called by any entity other than the staker');
    it('should revert if not called after the deadline');
    it('should revert if claims are opened');
    it('should set the claimable stake to 0');
    it('should transfer the tokens to the staker');
    it('should emit an event for the withdrawn stake');
  });
});
