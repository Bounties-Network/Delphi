/* eslint-env mocha */
/* global contract artifacts assert */

const LookupTable = artifacts.require('LookupTable.sol');

contract('LookupTable', () => {
  describe('Function: LookupTable (constructor)', () => {
    it('should instantiate lt[0] with a value of 20 for DV = 5', async () => {
      // Deploy a new LookupTable with a decay value of 5
      const DV = '5';
      const lt = await LookupTable.new(DV);

      // Get the first element in the lookup table.
      const lt0 = await lt.lt.call(0);

      // Because DV is 5, and 100/5 = 20, we should expect lt[0] to be 20.
      assert.strictEqual(lt0.toString(), '20', 'A LookupTable instantiated with a decay value of '
        + 'five should have an lt[0] of 20');
    });

    it('should instantiate lt[0] with a value of 14 for DV = 7', async () => {
      // Deploy a new LookupTable with a decay value of 7 
      const DV = '7';
      const lt = await LookupTable.new(DV);

      // Get the first element in the lookup table.
      const lt0 = await lt.lt.call(0);

      // Because DV is 7, and 100/7 = 14.285..., we should expect lt[0] to be 14, since the EVM
      // drops the remainder.
      assert.strictEqual(lt0.toString(), '14', 'A LookupTable instantiated with a decay value of '
        + 'five should have an lt[0] of 14');
    });
  });
});

