/* eslint-env mocha */
/* global contract */

contract('DelphiStake', () => {
  describe('Function: ruleOnClaim', () => {
    it('should revert if called by a non-arbiter');
    it('should revert if the claim has already been ruled');
    it('should properly set the claims accepted status');
    it('should add the claim\'s amount and fee to the stake iff the claim is not accepted');
    it('should not alter the stake if the claim is accepted');
    it('should transfer the fee to the arbiter');
    it('should decrement openClaims');
    it('it should set lockupEnding to now + lockupRemaining iff openClaims is zero after ruling');
    it('should emit a ClaimRuled event');
  });
});

