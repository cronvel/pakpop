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
	factor: 1.5 ,
	maxDelay: 10000 ,
	retries: 50
} ) ;

npm.users.listAsync = Promise.promisify( npm.users.list , npm.users ) ;



var availableSortType = {
	name: true ,
	day: true ,
	week: true ,
	month: true ,
	dependants: true
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

	if( ! availableSortType[ args.sortBy ] ) {
		term.red( "Bad sort type.\n\n" ) ;
		pakpop.usage() ;
		return ;
	}
	
	var data = await pakpop.getUserPackagesDownloads( args.user ) ;

	log.verbose( "data: %I" , data ) ;

} ;



pakpop.usage = function usage() {
	term( "^bUsage is: ^cpakpop <user-name> [<options1>] [<options2>] [...]\n" ) ;
	term( "^bIt retrieves all package download and dependants for an author.\n\n" ) ;
} ;



pakpop.getUserPackagesDownloads = async function( userName ) {

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

	log.verbose( "Package for %s: %I" , userName , userPackages ) ;
	
	var tableObject = [] ;
	
	try {
		await Promise.forEach( userPackages , package_ => {
			log.verbose( "Starting for %s" , package_.name ) ;
			
			return Promise.all( [
				pakpop.getPackageDownloadsForPeriod( package_.name , 'last-day' ) ,
				pakpop.getPackageDownloadsForPeriod( package_.name , 'last-week' ) ,
				pakpop.getPackageDownloadsForPeriod( package_.name , 'last-month' ) ,
				pakpop.getPackageDependants( package_.name )
			] )
			.then( ( [ lastDay , lastWeek , lastMonth , dependants ] ) => {
				log.verbose( "Results for %s: %I" , package_.name , [ lastDay , lastWeek , lastMonth , dependants ] ) ;
				tableObject.push(
					{
						name: package_.name ,
						lastDay: lastDay[0].downloads ,
						lastWeek: lastWeek[0].downloads ,
						lastMonth: lastMonth[0].downloads ,
						dependants: dependants.length || 0
					}
				) ;
			} )
		} ) ;
	}
	catch ( error ) {
		log.error( "getUserPackagesDownloads(): %E" , error ) ;
	}
	
	return tableObject ;
} ;



pakpop.getPackageDownloadsForPeriod = function( packageName , period ) {
	log.verbose( "Retrieving %s downloads for %s" , period , packageName ) ;

	return new Promise( ( resolve , reject ) => {
		npm.downloads.totals( period , packageName , ( error , data ) => {
			if( error ) {
				log.error( "Failed to retrieve %s download for %s" , period , packageName ) ;
				reject( error ) ;
			}
			else {
				log.verbose( "Done retrieving %s download for %s" , period , packageName ) ;
				resolve( data ) ;
			}
		} ) ;
	} ) ;
} ;



pakpop.getPackageDependants = function( packageName ) {
	log.verbose( "Retrieving dependants for %s" , packageName ) ;

	return new Promise( ( resolve , reject ) => {
		npm.packages.depended( packageName , ( error , data ) => {
			if( error ) {
				log.error( "Failed to retrieve dependants for %s" , packageName ) ;
				reject( error ) ;
			}
			else {
				log.verbose( "Done retrieving dependants for %s" , packageName ) ;
				resolve( data ) ;
			}
		} ) ;
	} ) ;
} ;

