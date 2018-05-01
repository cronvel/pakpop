/*
	Pak-Pop

	Copyright (c) 2018 Cédric Ronvel

	The MIT License (MIT)

	Permission is hereby granted, free of charge, to any person obtaining a copy
	of this software and associated documentation files (the "Software"), to deal
	in the Software without restriction, including without limitation the rights
	to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	copies of the Software, and to permit persons to whom the Software is
	furnished to do so, subject to the following conditions:

	The above copyright notice and this permission notice shall be included in all
	copies or substantial portions of the Software.

	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
	AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
	SOFTWARE.
*/

"use strict" ;



var term = require( 'terminal-kit' ).terminal ;
var Promise = require( 'seventh' ) ;

var pakpopPackage = require( '../package.json' ) ;

var Logfella = require( 'logfella' ) ;
var log = Logfella.global.use( 'pakpop' ) ;



var pakpop = {} ;
module.exports = pakpop ;



var npmRegistry = require( 'npm-registry' ) ;

var npm = new npmRegistry( {
	registry: 'https://registry.npmjs.org' ,
	factor: 1.2 ,
	mindelay: 50 ,
	maxdelay: 10000 ,
	retries: 50
} ) ;

npm.users.listAsync = Promise.promisify( npm.users.list , npm.users ) ;
npm.downloads.totalsAsync = Promise.promisify( npm.downloads.totals , npm.downloads ) ;
npm.packages.dependedAsync = Promise.promisify( npm.packages.depended , npm.packages ) ;


var availableSortType = {
	name: 'name' ,
	day: 'lastDay' ,
	week: 'lastWeek' ,
	month: 'lastMonth' ,
	dependents: 'dependents'
} ;



pakpop.cli = async function cli() {
	// Intro
	term.bold.magenta( 'pakpop' ).dim( ' v%s by Cédric Ronvel\n' , pakpopPackage.version ) ;

	// Manage command line arguments
	var args = require( 'minimist' )( process.argv.slice( 2 ) ) ;

	if ( args.help || args.h ) {
		pakpop.usage() ;
		return ;
	}

	// Init Logfella main logger
	var logLevel = 'info' ;

	if ( args.debug ) { logLevel = 'debug' ; }
	else if ( args.verbose ) { logLevel = 'verbose' ; }

	Logfella.global.setGlobalConfig( {
		minLevel: logLevel ,
		overrideConsole: true ,
		transports: [
			{
				type: 'console' , timeFormatter: 'time' , color: true , output: 'stderr'
			}
		]
	} ) ;

	args.user = args.user || args._[ 0 ] ;
	args.sortBy = args.sortBy || args.sort || 'month' ;

	if( ! args.user ) {
		pakpop.usage() ;
		return ;
	}

	if( ! ( args.sortBy = availableSortType[ args.sortBy ] ) ) {
		term.red( "Bad sort type.\n\n" ) ;
		pakpop.usage() ;
		return ;
	}

	term( "\n" ) ;

	try {
		var data = await pakpop.getUserPackagesDownloads( args.user , true ) ;
	}
	catch ( error ) {
		log.error( "cli(): %E" , error ) ;
		return ;
	}

	log.verbose( "data: %I" , data ) ;

	if ( args.sortBy !== 'name' ) {
		data.sort( ( a , b ) => a[ args.sortBy ] - b[ args.sortBy ] ) ;
	}

	pakpop.display( data ) ;
	term( "\n" ) ;
} ;



pakpop.usage = function usage() {
	term( "^bUsage is: ^cpakpop <user-name> [<options1>] [<options2>] [...]\n" ) ;
	term( "^bIt retrieves all package download and dependents for an author.\n\n" ) ;
} ;



pakpop.display = function display( data ) {
	var lastDay = 0 ,
		lastWeek = 0 ,
		lastMonth = 0 ,
		dependents = 0 ;

	term( "^+Package" ) ;
	term.column( 30 , " ^+Last Day" ) ;
	term.column( 45 , " ^+Last Week" ) ;
	term.column( 60 , " ^+Last Month" ) ;
	term.column( 75 , " ^+Dependents" ) ;
	term( "\n\n" ) ;

	data.forEach( row => {
		lastDay += row.lastDay ;
		lastWeek += row.lastWeek ;
		lastMonth += row.lastMonth ;
		dependents += row.dependents ;

		term( "^M^+%s" , row.name ) ;
		term.column.eraseLineAfter( 30 , " %s" , row.lastDay ) ;
		term.column.eraseLineAfter( 45 , " %s" , row.lastWeek ) ;
		term.column.eraseLineAfter( 60 , " %s" , row.lastMonth ) ;
		term.column.eraseLineAfter( 75 , " %s" , row.dependents ) ;
		term( "\n" ) ;
	} ) ;

	term( "\n" ) ;
	term.column( 30 , " ^+Last Day" ) ;
	term.column( 45 , " ^+Last Week" ) ;
	term.column( 60 , " ^+Last Month" ) ;
	term.column( 75 , " ^+Dependents" ) ;
	term( "\n" ) ;

	term( "^C^+Total" ) ;
	term.column( 30 , " %s" , lastDay ) ;
	term.column( 45 , " %s" , lastWeek ) ;
	term.column( 60 , " %s" , lastMonth ) ;
	term.column( 75 , " %s" , dependents ) ;
	term( "\n" ) ;
} ;



pakpop.getUserPackagesDownloads = async function( userName , interactive ) {

	try {
		var userPackages = await npm.users.listAsync( userName ) ;
	}
	catch ( error ) {
		log.error( "user package list: %E" , error ) ;
		return null ;
	}

	if( userPackages.length === 0 ) {
		log.verbose( "No package found for '%s'" , userName ) ;
		return null ;
	}

	log.verbose( "Packages by %s: %I" , userName , userPackages ) ;

	var data = [] ,
		timeout = 0 ,
		timeoutIncrement = 10 ;

	await Promise.every( userPackages , async( package_ ) => {

		// Avoid flooding the server too much...
		await Promise.resolveTimeout( timeout += timeoutIncrement ) ;

		log.verbose( "Starting for %s" , package_.name ) ;

		if ( interactive ) {
			term.column.eraseLineAfter( 1 , "^bAsking stats for %s" , package_.name ) ;
		}

		var packageData = await Promise.all( [
			npm.downloads.totalsAsync( 'last-day' , package_.name ) ,
			npm.downloads.totalsAsync( 'last-week' , package_.name ) ,
			npm.downloads.totalsAsync( 'last-month' , package_.name ) ,
			npm.packages.dependedAsync( package_.name )
		] ) ;

		packageData = {
			name: package_.name ,
			lastDay: packageData[ 0 ][ 0 ].downloads ,
			lastWeek: packageData[ 1 ][ 0 ].downloads ,
			lastMonth: packageData[ 2 ][ 0 ].downloads ,
			dependents: Array.isArray( packageData[ 3 ] ) ? packageData[ 3 ].length : 0
		} ;

		log.verbose( "Done for %s" , package_.name ) ;

		//log.verbose( "Results for %s: %I" , package_.name , packageData ) ;

		if ( interactive ) {
			term.column.eraseLineAfter( 1 , "^GRetrieved stats for %s" , package_.name ) ;
		}

		data.push( packageData ) ;
	} ) ;

	if ( interactive ) {
		term.column.eraseLineAfter( 1 ) ;
		term( "\n" ) ;
	}

	return data ;
} ;


