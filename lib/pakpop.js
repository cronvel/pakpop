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



var querystring = require( 'querystring' ) ;

var term = require( 'terminal-kit' ).terminal ;
var rQuest = require( 'rquest' ) ;
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

/*
	npm API

	/!\ This stoopid API does not want any trailing slash, if so it returns a 404 /!\

	Downloads with range:
	https://api.npmjs.org/downloads/range/2018-01-01:2018-05-03/terminal-kit

	Downloads with range name:
	https://api.npmjs.org/downloads/range/last-month/terminal-kit

	Total downloads name:
	https://api.npmjs.org/downloads/point/last-month/terminal-kit

	Depended upon:
	https://registry.npmjs.org/-/_view/dependedUpon?
		with a query string that encode:
		{
			startkey: '["insert-here-the-package-name"]',
			endkey: '["insert-here-the-package-name",{}]',
			group_level: '3',
			descending: 'false',
			stale: 'update_after'
		}

	User packages:
	
	DO NOT WORK ANYMORE:
	https://registry.npmjs.org/-/_view/browseAuthors?
		with a query string that encode:
		{
			startkey: '["insert-here-the-user-name"]',
			endkey: '["insert-here-the-user-name",{}]',
			group_level: '3',
			descending: 'false',
			stale: 'update_after'
		}
	
	Temporary solution:
	
	GET https://www.npmjs.com/~cronvel?page=1       ... and page=2 etc...
	X-Spiferack: 1								<-- wtf header that force JSON output
	
	In the JSON, if packages.url.next is set there is another page.
*/

//*
npm.users.listAsync = Promise.promisify( npm.users.list , npm.users ) ;
npm.downloads.totalsAsync = Promise.promisify( npm.downloads.totals , npm.downloads ) ;	// Return the sum for the range
npm.downloads.rangeAsync = Promise.promisify( npm.downloads.range , npm.downloads ) ;	// Return daily data for the range
npm.packages.dependedAsync = Promise.promisify( npm.packages.depended , npm.packages ) ;
//*/

/*
npm.users.listAsync = Promise.retry( 10 , 20 , 1.2 , Promise.promisify( npm.users.list , npm.users ) , npm.users ) ;
npm.downloads.totalsAsync = Promise.retry( 10 , 20 , 1.2 , Promise.promisify( npm.downloads.totals , npm.downloads ) , npm.downloads ) ;
npm.packages.dependedAsync = Promise.retry( 10 , 20 , 1.2 , Promise.promisify( npm.packages.depended , npm.packages ) , npm.packages ) ;
//*/

var defaultRetryOptions = {
	retries: 10 ,
	coolDown: 10 ,
	raiseFactor: 1.5 ,
	maxCoolDown: 30000
} ;



var availableSortType = {
	name: 'name' ,
	day: 'lastDay' ,
	week: 'lastWeek' ,
	month: 'lastMonth' ,
	dependents: 'dependents'
} ;



pakpop.cli = async function cli() {
	var command , target , requestFn , displayFn ;

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

	args.sortBy = args.sortBy || args.sort || 'month' ;

	if( ! args._ || ! args._.length ) {
		pakpop.usage() ;
		return ;
	}

	if ( args._.length === 1 ) {
		command = 'user-package-stats' ;
		target = args._[ 0 ] ;
	}
	else {
		command = args._[ 0 ] ;
		target = args._[ 1 ] ;
	}

	if( ! ( args.sortBy = availableSortType[ args.sortBy ] ) ) {
		term.red( "Bad sort type.\n\n" ) ;
		pakpop.usage() ;
		return ;
	}

	switch ( command ) {
		case 'user-package-stats' :
		case 'ups' :
			requestFn = pakpop.getUserPackageStats ;
			displayFn = pakpop.displayUserPackageStats ;
			break ;
		case 'user-packages' :
		case 'user-package' :
		case 'up' :
			requestFn = pakpop.getUserPackages ;
			displayFn = pakpop.displayUserPackages ;
			break ;
	}


	term( "\n" ) ;

	try {
		var data = await requestFn( target , true ) ;
	}
	catch ( error ) {
		log.error( "cli(): %E" , error ) ;
		return ;
	}

	log.verbose( "data: %I" , data ) ;

	if ( args.sortBy !== 'name' ) {
		data.sort( ( a , b ) => a[ args.sortBy ] - b[ args.sortBy ] ) ;
	}

	displayFn( data ) ;
	term( "\n" ) ;
} ;



pakpop.usage = function usage() {
	term( "^bUsage is: ^cpakpop <user-name> [<options1>] [<options2>] [...]\n" ) ;
	term( "^bIt retrieves all package download and dependents for an author.\n\n" ) ;
} ;



pakpop.displayUserPackageStats = function( data ) {
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

	term( "^C^+Total^: ^-(%i packages)" , data.length ) ;
	term.column( 30 , " %s" , lastDay ) ;
	term.column( 45 , " %s" , lastWeek ) ;
	term.column( 60 , " %s" , lastMonth ) ;
	term.column( 75 , " %s" , dependents ) ;
	term( "\n" ) ;
} ;



pakpop.displayUserPackages = function( data ) {
	data.forEach( row => {
		term( "^M^+%s" , row.name ) ;
		term.column.eraseLineAfter( 30 , " ^b%s" , row.description ) ;
		term( "\n" ) ;
	} ) ;
	term( "\n" ) ;
} ;



pakpop.getUserPackageStats = async function( userName , interactive ) {
	var userPackages = await pakpop.getUserPackageNames( userName , interactive ) ;

	if ( ! userPackages ) { return null ; }

	var data = [] ,
		timeout = 0 ,
		timeoutIncrement = 10 ;

	await Promise.every( userPackages , async( userPackage ) => {

		// Avoid flooding the server too much...
		await Promise.resolveTimeout( timeout += timeoutIncrement ) ;

		data.push( await pakpop.getPackageStats( userPackage , interactive ) ) ;
	} ) ;

	if ( interactive ) {
		term.column.eraseLineAfter( 1 ) ;
		term( "\n" ) ;
	}

	return data ;
} ;



pakpop.getUserPackages = async function( userName , interactive ) {
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

	return userPackages ;
} ;



pakpop.getUserPackages = function( userName , interactive ) {
	var query = querystring.stringify( {
		startkey: '["' + userName + '"]' ,
		endkey: '["' + userName + '",{}]' ,
		group_level: '3' ,
		descending: 'false' ,
		stale: 'update_after'
	} ) ;

	var serviceUrl = 'https://registry.npmjs.org/-/_view/browseAuthors?' + query ;

	return rQuest.getJson( serviceUrl , defaultRetryOptions ).then(
		data => {
			if ( ! data || ! data.rows || ! data.rows.length ) {
				log.verbose( "No package found for '%s'" , userName ) ;
				return null ;
			}

			//log.verbose( "Raw result: %I" , data ) ;
			var userPackages = data.rows.map( row => ( { name: row.key[ 1 ] , description: row.key[ 2 ] } ) ) ;
			log.verbose( "Packages by %s: %I" , userName , userPackages ) ;
			return userPackages ;
		} ,
		error => {
			log.error( "user package list: %E" , error ) ;
			return null ;
		}
	) ;
} ;



pakpop.getUserPackageNames = async function( userName , interactive ) {
	var userPackages = await pakpop.getUserPackages( userName , interactive ) ;

	if ( ! userPackages ) { return null ; }

	return userPackages.map( p => p.name ) ;
} ;



pakpop.getPackageStats = async function( packageName , interactive ) {
	log.verbose( "Starting for %s" , packageName ) ;

	if ( interactive ) {
		term.column.eraseLineAfter( 1 , "^bAsking stats for %s" , packageName ) ;
	}

	try {
		var rawData = await Promise.all( [
			npm.downloads.totalsAsync( 'last-day' , packageName ) ,
			npm.downloads.totalsAsync( 'last-week' , packageName ) ,
			npm.downloads.totalsAsync( 'last-month' , packageName ) ,
			npm.packages.dependedAsync( packageName )
		] ) ;
	}
	catch ( error ) {
		log.verbose( "Error for %s: %E" , packageName , error ) ;

		if ( interactive ) {
			term.column.eraseLineAfter( 1 , "^RCan't retrieve stats for %s: %s" , packageName , error ) ;
		}

		return {
			name: packageName ,
			lastDay: 0 ,
			lastWeek: 0 ,
			lastMonth: 0 ,
			dependents: 0
		} ;
	}

	var packageData = {
		name: packageName ,
		lastDay: rawData[ 0 ][ 0 ].downloads ,
		lastWeek: rawData[ 1 ][ 0 ].downloads ,
		lastMonth: rawData[ 2 ][ 0 ].downloads ,
		dependents: Array.isArray( rawData[ 3 ] ) ? rawData[ 3 ].length : 0
	} ;

	log.verbose( "Done for %s" , packageName ) ;

	//log.verbose( "Results for %s: %I" , packageName , packageData ) ;

	if ( interactive ) {
		term.column.eraseLineAfter( 1 , "^GRetrieved stats for %s" , packageName ) ;
	}

	return packageData ;
} ;


