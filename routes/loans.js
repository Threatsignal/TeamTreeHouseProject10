const express = require('express');
const router = express.Router();
const Books = require("../models").Books;
const Patrons = require("../models").Patrons;
const Loans = require("../models").Loans;
const dateFormat = require('dateformat');
const Sequelize = require('sequelize');
const Op = Sequelize.Op;
const toDate = require('./utils').toDate;
const throwError = require('./utils').throwError;
const renderView = require('./utils').renderView;
const re = new RegExp("^\\d{4}\\-(0?[1-9]|1[012])\\-(0?[1-9]|[12][0-9]|3[01])$");

/*
POST REQUESTS
 */

router.post('/create', (req, res, next) => {
	if (!req.body.book_id || !req.body.patron_id || !req.body.loaned_on || !re.test(req.body.loaned_on)
		|| !req.body.return_by || !re.test(req.body.return_by)) { //Check the values exist and that the dates are in format YYYY-MM-DD
		return throwError(400, "Book, Patron, Loaned On Fields are required! And Date Fields Must be Format YYYY-MM-DD", '/loans/new', next);
	}
	//Now we know dates in format YYYY-MM-DD test to make sure loaned_on comes before return_by.
	if(toDate(req.body.return_by) < toDate(req.body.loaned_on) ) {
		return throwError(400, "Return By Date Must be after Date book was Loaned!", '/loans/new', next);
	}
	Loans.findAll({
		where: {
			book_id: req.body.book_id,
			returned_on: null
		}
	}).then((loans) => {
		if (loans.length !== 0) {
			return throwError(400, "Book Already being loaned!", '/loans/new', next);
		}
		Loans.create(req.body).then(() => {
			res.redirect("/loans/find/all");
		}).catch((err) => {
			return next(err);
		});
	});
});

router.post('/update/:loanId/:bookId/:name/:loanedOn', (req, res, next) => {
	let link = '/books/return_book/' + req.params.bookId.toString() + '/' + req.params.name.toString();
	if (!req.body.returned_on || !re.test(req.body.returned_on)) {
		return throwError(400, "Returned On is required and must be format YYYY-MM-DD", link, next);
	}
	if ( toDate(req.body.returned_on) < toDate(req.params.loanedOn)) {
		return throwError(400, "Returned On Date Must be after book was Loaned!", link, next);
	}
	Loans.findById(req.params.loanId).then((loan) => {
		return loan.update(req.body);
	}).then((loan) => {
		res.redirect("/books/details/" + loan.book_id);
	});
});

/*
GET REQUESTS
 */

router.get('/find/:filter', (req, res, next) => {
	let obj = {};
	if(req.params.filter.toLowerCase() === 'overdue'){
		obj = {
			where: {
				return_by: {
					[Op.lte]: dateFormat(this.createdAt, "yyyy-mm-dd")
				},
				returned_on: null
			}
		};
	}
	else if(req.params.filter.toLowerCase() === 'checked_out'){
		obj = {
			where: {
				returned_on: null
			}
		};
	}
	else{
		obj = {};
	}
		Loans.findAll(obj).then((loans) => {
			let indexBooks = 0;
			let indexPatrons = 0;
			loans.forEach((loan) => {
				Books.findById(loan.book_id).then((book) => {
					loan.book_title = book.title;
					indexBooks++;
				}).then(() => {
					Patrons.findById(loan.patron_id).then((patron) => {
						loan.patron_name = patron.first_name + ' ' + patron.last_name;
						indexPatrons++;
					}).then(() => {
						if ((indexBooks === loans.length) && (indexPatrons === loans.length)) {
							req.params.loans = loans;
							next();
						}
					});
				});
			});
		}).catch((err) => {
			next(err);
		});
}, (req, res) => {
	res.render('loans/all_loans', {title: 'Loans | All', loans: req.params.loans});
});

router.get('/new', (req, res, next) => {
	Books.findAll().then((books) => {
		req.params.books = books;
		Patrons.findAll().then((patrons) => {
			req.params.patrons = patrons;
			let now = Date.now();
			req.params.loaned_on = dateFormat(now, "yyyy-mm-dd");
			req.params.return_by = dateFormat(now + (1000 * 60 * 60 * 24 * 7), "yyyy-mm-dd"); //(1000*60*60*24*4) is 4 days in milliseconds
		}).then(() => {
			next();
		})
	});
}, (req, res) => {
	return renderView('loans/new_loan', {title: 'Loans | New',	books: req.params.books, patrons: req.params.patrons,
		loanedOn: req.params.loaned_on,	returnBy: req.params.return_by }, req, res);
});


module.exports = router;
