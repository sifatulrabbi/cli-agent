package utils

func Ternary[T any](cond bool, ifTrue, ifFalse T) T {
	if cond {
		return ifTrue
	} else {
		return ifFalse
	}
}
