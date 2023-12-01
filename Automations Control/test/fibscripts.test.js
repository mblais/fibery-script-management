// Coverage testing


test('main (with supplied args)', () => {
    require('./fibscripts')         // execute main()
    expect( fibScripts.main(process.argv) ).toBe( 0 )
})