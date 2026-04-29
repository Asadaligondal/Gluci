import instaloader

L = instaloader.Instaloader()
try:
    L.login('averageenginneer', '@Sdfg54321')
except instaloader.TwoFactorAuthRequiredException:
    code = input('Enter 2FA code: ')
    L.two_factor_login(code)

L.save_session_to_file()
print('Session saved!')