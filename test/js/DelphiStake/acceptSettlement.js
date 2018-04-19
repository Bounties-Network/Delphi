/* eslint-env mocha */
/* global contract */

contract('DelphiStake', () => {
  describe('Function: acceptSettlement', () => {
    it('should revert if called with an out-of-bounds claimId');
    it('should revert if called with an out-of-bounds settlementId');
    it('should revert if called by anyone but the staker or the claimant corresponding to the claimId');
    it('should revert if settlement has failed');
    it('should set the stakerAgrees to true when called by a staker on a claimants settlement');
    it('should set the claimantAgrees to true when called by a claimant on a claimants settlement');
    it('should revert if called by a staker on their own settlement');
    it('should revert if called by a claimant on their own settlement');
    it('should revert if the settlement is not agreed upon by both parties, or if the settlement has failed, or the claim has been ruled upon');
    it('should set the claim.ruled to true');
    it('should return the unused claim funds from the staker back to their stake');
    it('should decrement the number of open claims');
    it('should transfer the settlement amount, plus their original deposit, back to the claimant');
    it('should emit a SettlementAccepted event');
  });
});
