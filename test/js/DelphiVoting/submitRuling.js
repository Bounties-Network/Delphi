/* eslint-env mocha */
/* global contract  */

contract('DelphiVoting', (accounts) => { //eslint-disable-line
  describe('Function: submitRuling', () => {
    it('should allow anyone to submit a ruling (non-voters)');
    it('should revert if the claimId generated from the stake address and claim number doesnt exist');
    it('should revert if the commit period is active');
    it('should revert if the reveal period is active');
    it('should correctly tally the votes');
    it('should correctly rule on the claim in the stake');
  });
});
