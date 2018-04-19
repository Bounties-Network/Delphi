/* eslint-env mocha */
/* global contract */

contract('DelphiStake', () => {
  describe('Function: proposeSettlement', () => {
    it('should revert if called with an out-of-bounds claimId');
    it('should revert if called by anyone but the staker or the claimant corresponding to the claimId');
    it('should revert if settlement has failed');
    it('should revert if the proposed settlement _amount is less than the sum of the amount and fee of the claim in question');
    it('should create a new settlement by the claimant, and have the settlement properly initialize the fields');
    it('should create a new settlement by the staker, and have the settlement properly initialize the fields');
    it('should emit a SettlementProposed event');
  });
});
