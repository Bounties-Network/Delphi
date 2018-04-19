/* eslint-env mocha */
/* global contract */

contract('DelphiStake', () => {
  describe('Function: settlementFailed', () => {
    it('should revert if called with an out-of-bounds claimId');
    it('should revert if called by anyone but the staker or the claimant corresponding to the claimId');
    it('should revert if settlement has already failed');
    it('should emit the SettlementFailed event');
  });
});
